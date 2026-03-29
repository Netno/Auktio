import { createServerClient } from "./supabase";

type SettingRow = {
  key: string;
  value_json: unknown;
};

export type AiPricingConfig = {
  usdToSek: number | null;
  usdToSekFetchedAt: string | null;
  usdToSekSource: string | null;
  models: Record<
    string,
    {
      inputUsdPer1M: number | null;
      outputUsdPer1M: number | null;
    }
  >;
};

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getObjectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function getSettings(
  keys: string[],
): Promise<Map<string, unknown>> {
  if (keys.length === 0) {
    return new Map();
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("auc_settings")
      .select("key, value_json")
      .in("key", keys);

    if (error) {
      console.error("[settings] Failed to load settings:", error.message);
      return new Map();
    }

    return new Map(
      ((data ?? []) as SettingRow[]).map((row) => [row.key, row.value_json]),
    );
  } catch (error) {
    console.error("[settings] Unexpected settings load error:", error);
    return new Map();
  }
}

export async function getAiPricingConfig(): Promise<AiPricingConfig> {
  const settings = await getSettings([
    "ai.exchange.usd_sek_rate",
    "ai.pricing.gemini-2.0-flash",
    "ai.pricing.gemini-embedding-001",
  ]);

  const exchangeValue = getObjectValue(
    settings.get("ai.exchange.usd_sek_rate"),
  );
  const flashPricing = getObjectValue(
    settings.get("ai.pricing.gemini-2.0-flash"),
  );
  const embeddingPricing = getObjectValue(
    settings.get("ai.pricing.gemini-embedding-001"),
  );

  return {
    usdToSek: toFiniteNumber(exchangeValue?.value),
    usdToSekFetchedAt:
      typeof exchangeValue?.fetchedAt === "string"
        ? exchangeValue.fetchedAt
        : null,
    usdToSekSource:
      typeof exchangeValue?.source === "string" ? exchangeValue.source : null,
    models: {
      "gemini-2.0-flash": {
        inputUsdPer1M: toFiniteNumber(flashPricing?.inputUsdPer1M),
        outputUsdPer1M: toFiniteNumber(flashPricing?.outputUsdPer1M),
      },
      "gemini-embedding-001": {
        inputUsdPer1M: toFiniteNumber(embeddingPricing?.inputUsdPer1M),
        outputUsdPer1M: toFiniteNumber(embeddingPricing?.outputUsdPer1M),
      },
    },
  };
}
