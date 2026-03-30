import { createServerClient } from "./supabase";
import { getAiPricingConfig, type AiPricingConfig } from "./settings";

type AiUsageStatus = "success" | "error" | "cache-hit";

type AiUsageEvent = {
  provider: "google";
  model: string;
  operation: string;
  status: AiUsageStatus;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  tokenMetricsReported?: boolean;
  itemCount?: number;
  cacheHit?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

type SyncLogRow = {
  id: number;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
};

type ParsedAiUsageRow = AiUsageEvent & {
  id: number;
  createdAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  tokenMetricsReported: boolean;
};

export type AiUsageDailySummary = {
  date: string;
  requests: number;
  success: number;
  errors: number;
  cacheHits: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  hasUnreportedTokenMetrics: boolean;
  totalLatencyMs: number;
  estimatedCostSek: number | null;
};

export type AiUsageHourlySummary = {
  hour: string;
  requests: number;
  success: number;
  errors: number;
  cacheHits: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  hasUnreportedTokenMetrics: boolean;
  totalLatencyMs: number;
  estimatedCostSek: number | null;
};

export type AiUsageDashboardData = {
  totals: {
    requests: number;
    success: number;
    errors: number;
    cacheHits: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    hasUnreportedTokenMetrics: boolean;
    averageLatencyMs: number;
    totalLatencyMs: number;
    estimatedCostSek: number | null;
  };
  daily: AiUsageDailySummary[];
  hourly: AiUsageHourlySummary[];
  pricing: {
    usdToSek: number | null;
    usdToSekFetchedAt: string | null;
    usdToSekSource: string | null;
  };
  models: Array<{
    model: string;
    requests: number;
    success: number;
    errors: number;
    totalTokens: number;
    hasUnreportedTokenMetrics: boolean;
    averageLatencyMs: number;
    estimatedCostSek: number | null;
  }>;
  startedAt: string | null;
};

type GeminiUsageMetadata = {
  promptTokenCount: number | null;
  candidatesTokenCount: number | null;
  totalTokenCount: number | null;
  cachedContentTokenCount: number | null;
  tokenMetricsReported: boolean;
};

const AI_USAGE_STATUSES = ["ai-success", "ai-error", "ai-cache-hit"];
const REPORT_TIME_ZONE = "Europe/Stockholm";

function statusToSyncLogStatus(status: AiUsageStatus) {
  return `ai-${status}`;
}

function safeNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function hasTokenMetricValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function inferTokenMetricsReported(parsed: AiUsageEvent) {
  if (typeof parsed.tokenMetricsReported === "boolean") {
    return parsed.tokenMetricsReported;
  }

  const isLegacyEmbeddingEvent =
    parsed.model === "gemini-embedding-001" &&
    parsed.operation.startsWith("embed") &&
    safeNumber(parsed.inputTokens) === 0 &&
    safeNumber(parsed.outputTokens) === 0 &&
    safeNumber(parsed.totalTokens) === 0;

  if (isLegacyEmbeddingEvent) {
    return false;
  }

  return (
    parsed.inputTokens != null ||
    parsed.outputTokens != null ||
    parsed.totalTokens != null
  );
}

function formatInTimeZone(value: string, options: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: REPORT_TIME_ZONE,
    ...options,
  });

  return formatter.format(date);
}

function getLocalDayKey(value: string) {
  return formatInTimeZone(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getLocalHourKey(value: string) {
  return formatInTimeZone(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
}

function parseAiUsagePayload(row: SyncLogRow): ParsedAiUsageRow | null {
  if (!row.error_message) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.error_message) as AiUsageEvent;
    const tokenMetricsReported = inferTokenMetricsReported(parsed);

    return {
      ...parsed,
      id: row.id,
      latencyMs: safeNumber(parsed.latencyMs || row.duration_ms),
      inputTokens: tokenMetricsReported ? safeNumber(parsed.inputTokens) : null,
      outputTokens: tokenMetricsReported
        ? safeNumber(parsed.outputTokens)
        : null,
      totalTokens: tokenMetricsReported ? safeNumber(parsed.totalTokens) : null,
      tokenMetricsReported,
      itemCount: safeNumber(parsed.itemCount),
      cacheHit: Boolean(parsed.cacheHit || row.status === "ai-cache-hit"),
      createdAt: parsed.createdAt ?? row.started_at,
    };
  } catch {
    return null;
  }
}

function estimateCostSek(
  event: Pick<ParsedAiUsageRow, "model" | "inputTokens" | "outputTokens">,
  pricing: AiPricingConfig,
) {
  if (!pricing.usdToSek) {
    return null;
  }

  const modelPricing = pricing.models[event.model];
  const inputRate = modelPricing?.inputUsdPer1M ?? null;
  const outputRate = modelPricing?.outputUsdPer1M ?? null;

  if (inputRate == null && outputRate == null) {
    return null;
  }

  const inputCostUsd =
    ((event.inputTokens ?? 0) / 1_000_000) * (inputRate ?? 0);
  const outputCostUsd =
    ((event.outputTokens ?? 0) / 1_000_000) * (outputRate ?? 0);

  return (inputCostUsd + outputCostUsd) * pricing.usdToSek;
}

export function extractGeminiUsageMetadata(
  payload: unknown,
): GeminiUsageMetadata {
  const usage = (payload as { usageMetadata?: GeminiUsageMetadata } | null)
    ?.usageMetadata;
  const tokenMetricsReported =
    hasTokenMetricValue(usage?.promptTokenCount) ||
    hasTokenMetricValue(usage?.candidatesTokenCount) ||
    hasTokenMetricValue(usage?.totalTokenCount) ||
    hasTokenMetricValue(usage?.cachedContentTokenCount);

  return {
    promptTokenCount: tokenMetricsReported
      ? safeNumber(usage?.promptTokenCount)
      : null,
    candidatesTokenCount: tokenMetricsReported
      ? safeNumber(usage?.candidatesTokenCount)
      : null,
    totalTokenCount: tokenMetricsReported
      ? safeNumber(usage?.totalTokenCount)
      : null,
    cachedContentTokenCount: tokenMetricsReported
      ? safeNumber(usage?.cachedContentTokenCount)
      : null,
    tokenMetricsReported,
  };
}

export async function logAiUsage(event: AiUsageEvent): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase.from("auc_sync_log").insert({
      house_id: null,
      status: statusToSyncLogStatus(event.status),
      duration_ms: Math.round(event.latencyMs),
      error_message: JSON.stringify({
        ...event,
        createdAt: event.createdAt ?? new Date().toISOString(),
      }),
      started_at: event.createdAt ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ai-usage] Failed to log AI usage event:", error);
  }
}

export async function getAiUsageDashboardData(
  days = 30,
): Promise<AiUsageDashboardData> {
  const supabase = createServerClient();
  const fromDate = new Date(Date.now() - days * 86_400_000).toISOString();
  const pricing = await getAiPricingConfig();

  const { data, error } = await supabase
    .from("auc_sync_log")
    .select("id, status, duration_ms, error_message, started_at")
    .gte("started_at", fromDate)
    .in("status", AI_USAGE_STATUSES)
    .order("started_at", { ascending: true });

  if (error) {
    throw new Error(`[ai-usage] Failed to load usage data: ${error.message}`);
  }

  const rows = ((data ?? []) as SyncLogRow[])
    .map(parseAiUsagePayload)
    .filter((row): row is ParsedAiUsageRow => row != null);

  const totals = {
    requests: rows.length,
    success: 0,
    errors: 0,
    cacheHits: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    hasUnreportedTokenMetrics: false,
    averageLatencyMs: 0,
    totalLatencyMs: 0,
    estimatedCostSek: null as number | null,
  };

  const dailyMap = new Map<string, AiUsageDailySummary>();
  const hourlyMap = new Map<string, AiUsageHourlySummary>();
  const modelMap = new Map<
    string,
    {
      model: string;
      requests: number;
      success: number;
      errors: number;
      totalTokens: number;
      hasUnreportedTokenMetrics: boolean;
      totalLatencyMs: number;
      estimatedCostSek: number | null;
    }
  >();

  let totalEstimatedCostSek = 0;
  let hasEstimatedCost = false;

  for (const row of rows) {
    totals.success += row.status === "success" ? 1 : 0;
    totals.errors += row.status === "error" ? 1 : 0;
    totals.cacheHits += row.cacheHit ? 1 : 0;
    totals.inputTokens += row.inputTokens ?? 0;
    totals.outputTokens += row.outputTokens ?? 0;
    totals.totalTokens += row.totalTokens ?? 0;
    totals.hasUnreportedTokenMetrics ||= !row.tokenMetricsReported;
    totals.totalLatencyMs += row.latencyMs;

    const rowEstimatedCost = estimateCostSek(row, pricing);
    if (rowEstimatedCost != null) {
      totalEstimatedCostSek += rowEstimatedCost;
      hasEstimatedCost = true;
    }

    const dayKey = getLocalDayKey(row.createdAt);
    if (!dayKey) {
      continue;
    }

    const dayEntry = dailyMap.get(dayKey) ?? {
      date: dayKey,
      requests: 0,
      success: 0,
      errors: 0,
      cacheHits: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      hasUnreportedTokenMetrics: false,
      totalLatencyMs: 0,
      estimatedCostSek: null,
    };
    dayEntry.requests += 1;
    dayEntry.success += row.status === "success" ? 1 : 0;
    dayEntry.errors += row.status === "error" ? 1 : 0;
    dayEntry.cacheHits += row.cacheHit ? 1 : 0;
    dayEntry.inputTokens += row.inputTokens ?? 0;
    dayEntry.outputTokens += row.outputTokens ?? 0;
    dayEntry.totalTokens += row.totalTokens ?? 0;
    dayEntry.hasUnreportedTokenMetrics ||= !row.tokenMetricsReported;
    dayEntry.totalLatencyMs += row.latencyMs;
    if (rowEstimatedCost != null) {
      dayEntry.estimatedCostSek =
        (dayEntry.estimatedCostSek ?? 0) + rowEstimatedCost;
    }
    dailyMap.set(dayKey, dayEntry);

    const localHourKey = getLocalHourKey(row.createdAt);
    if (!localHourKey) {
      continue;
    }

    const hourKey = `${localHourKey}:00`;
    const hourEntry = hourlyMap.get(hourKey) ?? {
      hour: hourKey,
      requests: 0,
      success: 0,
      errors: 0,
      cacheHits: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      hasUnreportedTokenMetrics: false,
      totalLatencyMs: 0,
      estimatedCostSek: null,
    };
    hourEntry.requests += 1;
    hourEntry.success += row.status === "success" ? 1 : 0;
    hourEntry.errors += row.status === "error" ? 1 : 0;
    hourEntry.cacheHits += row.cacheHit ? 1 : 0;
    hourEntry.inputTokens += row.inputTokens ?? 0;
    hourEntry.outputTokens += row.outputTokens ?? 0;
    hourEntry.totalTokens += row.totalTokens ?? 0;
    hourEntry.hasUnreportedTokenMetrics ||= !row.tokenMetricsReported;
    hourEntry.totalLatencyMs += row.latencyMs;
    if (rowEstimatedCost != null) {
      hourEntry.estimatedCostSek =
        (hourEntry.estimatedCostSek ?? 0) + rowEstimatedCost;
    }
    hourlyMap.set(hourKey, hourEntry);

    const modelEntry = modelMap.get(row.model) ?? {
      model: row.model,
      requests: 0,
      success: 0,
      errors: 0,
      totalTokens: 0,
      hasUnreportedTokenMetrics: false,
      totalLatencyMs: 0,
      estimatedCostSek: null as number | null,
    };
    modelEntry.requests += 1;
    modelEntry.success += row.status === "success" ? 1 : 0;
    modelEntry.errors += row.status === "error" ? 1 : 0;
    modelEntry.totalTokens += row.totalTokens ?? 0;
    modelEntry.hasUnreportedTokenMetrics ||= !row.tokenMetricsReported;
    modelEntry.totalLatencyMs += row.latencyMs;
    if (rowEstimatedCost != null) {
      modelEntry.estimatedCostSek =
        (modelEntry.estimatedCostSek ?? 0) + rowEstimatedCost;
    }
    modelMap.set(row.model, modelEntry);
  }

  totals.averageLatencyMs =
    rows.length > 0 ? totals.totalLatencyMs / rows.length : 0;
  totals.estimatedCostSek = hasEstimatedCost ? totalEstimatedCostSek : null;

  return {
    totals,
    daily: Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    hourly: Array.from(hourlyMap.values()).sort((a, b) =>
      a.hour.localeCompare(b.hour),
    ),
    pricing: {
      usdToSek: pricing.usdToSek,
      usdToSekFetchedAt: pricing.usdToSekFetchedAt,
      usdToSekSource: pricing.usdToSekSource,
    },
    models: Array.from(modelMap.values())
      .map((entry) => ({
        model: entry.model,
        requests: entry.requests,
        success: entry.success,
        errors: entry.errors,
        totalTokens: entry.totalTokens,
        hasUnreportedTokenMetrics: entry.hasUnreportedTokenMetrics,
        averageLatencyMs:
          entry.requests > 0 ? entry.totalLatencyMs / entry.requests : 0,
        estimatedCostSek: entry.estimatedCostSek,
      }))
      .sort((a, b) => b.requests - a.requests),
    startedAt: rows[0]?.createdAt ?? null,
  };
}
