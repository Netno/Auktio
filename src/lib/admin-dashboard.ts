import { createServerClient } from "./supabase";

type SyncLogStatus = "success" | "error" | "partial";

type IngestRunRow = {
  id: number;
  house_id: string | null;
  status: SyncLogStatus;
  lots_added: number | null;
  lots_updated: number | null;
  lots_skipped: number | null;
  lots_removed: number | null;
  duration_ms: number | null;
  started_at: string;
  error_message: string | null;
  auc_auction_houses?: {
    name?: string | null;
  } | null;
};

type LotAuditRow = {
  id: number;
  title: string;
  house_id: string;
  end_time: string | null;
  availability: string | null;
  categories: string[] | null;
  ai_categories: string[] | null;
  image_description: string | null;
  embedding: unknown;
  auc_auction_houses?: {
    name?: string | null;
  } | null;
};

export type IngestRunSummary = {
  id: number;
  houseId: string | null;
  houseName: string;
  status: SyncLogStatus;
  lotsAdded: number;
  lotsUpdated: number;
  lotsSkipped: number;
  lotsRemoved: number;
  durationMs: number;
  startedAt: string;
  errorMessage: string | null;
};

export type MissingLotSummary = {
  scopeTotal: number;
  missingCategories: number;
  missingAiTags: number;
  missingImageDescription: number;
  missingEmbedding: number;
};

export type AdminLotRecord = {
  id: number;
  title: string;
  houseId: string;
  houseName: string;
  endTime: string | null;
  isActive: boolean;
  missing: Array<"categories" | "ai-tags" | "image-description" | "embedding">;
};

export type AdminLotFilters = {
  houseId?: string;
  onlyActive?: boolean;
  missingCategories?: "any" | "missing" | "present";
  missingAiTags?: "any" | "missing" | "present";
  missingImageDescription?: "any" | "missing" | "present";
  missingEmbedding?: "any" | "missing" | "present";
  missingMatch?: "any" | "all";
  limit?: number;
};

async function fetchAllLotAuditRows(buildQuery: () => any, batchSize = 500) {
  const rows: LotAuditRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery().range(
      offset,
      offset + batchSize - 1,
    );

    if (error) {
      throw error;
    }

    const batch = (data ?? []) as LotAuditRow[];
    rows.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return rows;
}

export async function getAdminIngestRuns(filters?: {
  houseId?: string;
  status?: SyncLogStatus;
  limit?: number;
}) {
  const supabase = createServerClient();
  let query = supabase
    .from("auc_sync_log")
    .select(
      "id, house_id, status, lots_added, lots_updated, lots_skipped, lots_removed, duration_ms, started_at, error_message, auc_auction_houses(name)",
    )
    .not("status", "like", "ai-%")
    .order("started_at", { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.houseId) {
    query = query.eq("house_id", filters.houseId);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[admin] Failed to load ingest runs: ${error.message}`);
  }

  return ((data ?? []) as IngestRunRow[]).map((row) => ({
    id: row.id,
    houseId: row.house_id,
    houseName: row.auc_auction_houses?.name ?? row.house_id ?? "Okänt hus",
    status: row.status,
    lotsAdded: row.lots_added ?? 0,
    lotsUpdated: row.lots_updated ?? 0,
    lotsSkipped: row.lots_skipped ?? 0,
    lotsRemoved: row.lots_removed ?? 0,
    durationMs: row.duration_ms ?? 0,
    startedAt: row.started_at,
    errorMessage: row.error_message,
  })) satisfies IngestRunSummary[];
}

function isMissingArray(value: string[] | null | undefined) {
  return !Array.isArray(value) || value.length === 0;
}

function isMissingText(value: string | null | undefined) {
  return !value || value.trim().length === 0;
}

function getMissingFlags(row: LotAuditRow) {
  const missing: AdminLotRecord["missing"] = [];

  if (isMissingArray(row.categories)) {
    missing.push("categories");
  }

  if (isMissingArray(row.ai_categories)) {
    missing.push("ai-tags");
  }

  if (isMissingText(row.image_description)) {
    missing.push("image-description");
  }

  if (!row.embedding) {
    missing.push("embedding");
  }

  return missing;
}

export async function getAdminLotAudit(filters: AdminLotFilters = {}) {
  const supabase = createServerClient();
  const onlyActive = filters.onlyActive ?? true;
  const limit = Math.min(filters.limit ?? 100, 250);
  const missingMatch = filters.missingMatch ?? "any";
  const nowIso = new Date().toISOString();
  const selectedMissingFlags: AdminLotRecord["missing"] = [
    ...(filters.missingCategories === "missing"
      ? (["categories"] as const)
      : []),
    ...(filters.missingAiTags === "missing" ? (["ai-tags"] as const) : []),
    ...(filters.missingImageDescription === "missing"
      ? (["image-description"] as const)
      : []),
    ...(filters.missingEmbedding === "missing" ? (["embedding"] as const) : []),
  ];
  const selectedPresentFlags: AdminLotRecord["missing"] = [
    ...(filters.missingCategories === "present"
      ? (["categories"] as const)
      : []),
    ...(filters.missingAiTags === "present" ? (["ai-tags"] as const) : []),
    ...(filters.missingImageDescription === "present"
      ? (["image-description"] as const)
      : []),
    ...(filters.missingEmbedding === "present" ? (["embedding"] as const) : []),
  ];

  const rows = await fetchAllLotAuditRows(() => {
    let query = supabase
      .from("auc_lots")
      .select(
        "id, title, house_id, end_time, availability, categories, ai_categories, image_description, embedding, auc_auction_houses(name)",
      )
      .order("end_time", { ascending: true, nullsFirst: false });

    if (filters.houseId) {
      query = query.eq("house_id", filters.houseId);
    }

    if (onlyActive) {
      query = query.gt("end_time", nowIso).is("availability", null);
    }

    return query;
  });

  const filteredRows = rows.filter((row) => {
    const missing = getMissingFlags(row);

    if (selectedPresentFlags.some((flag) => missing.includes(flag))) {
      return false;
    }

    if (selectedMissingFlags.length === 0) {
      return missing.length > 0;
    }

    if (missingMatch === "all") {
      return selectedMissingFlags.every((flag) => missing.includes(flag));
    }

    return selectedMissingFlags.some((flag) => missing.includes(flag));
  });

  const summary = rows.reduce<MissingLotSummary>(
    (accumulator, row) => {
      const missing = getMissingFlags(row);
      accumulator.scopeTotal += 1;
      accumulator.missingCategories += missing.includes("categories") ? 1 : 0;
      accumulator.missingAiTags += missing.includes("ai-tags") ? 1 : 0;
      accumulator.missingImageDescription += missing.includes(
        "image-description",
      )
        ? 1
        : 0;
      accumulator.missingEmbedding += missing.includes("embedding") ? 1 : 0;
      return accumulator;
    },
    {
      scopeTotal: 0,
      missingCategories: 0,
      missingAiTags: 0,
      missingImageDescription: 0,
      missingEmbedding: 0,
    },
  );

  const lots: AdminLotRecord[] = filteredRows.slice(0, limit).map((row) => ({
    id: row.id,
    title: row.title,
    houseId: row.house_id,
    houseName: row.auc_auction_houses?.name ?? row.house_id,
    endTime: row.end_time,
    isActive: Boolean(
      row.end_time && row.end_time > nowIso && row.availability == null,
    ),
    missing: getMissingFlags(row),
  }));

  return {
    summary,
    matchingTotal: filteredRows.length,
    lots,
  };
}

export async function getAdminHouseOptions() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_auction_houses")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`[admin] Failed to load house options: ${error.message}`);
  }

  return (data ?? []) as Array<{ id: string; name: string }>;
}
