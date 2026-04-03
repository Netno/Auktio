import { generateQueryEmbedding } from "@/lib/embeddings";
import { normalizeSearchText } from "@/lib/search-language";
import { createServerClient } from "@/lib/supabase";
import { markUserInterestProfileDirty } from "@/lib/user-recommendation-matches";

const SEARCH_LOG_DEDUPE_WINDOW_MS = 30_000;

const SEARCH_LOG_SOURCES = [
  "search_bar",
  "autocomplete",
  "category_pill",
  "filter_change",
] as const;

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

type SearchLogRow = {
  id: number;
  query_text: string | null;
  selected_categories: string[] | null;
  filters_applied: JsonLike;
  source: SearchLogSource;
};

export type SearchLogSource = (typeof SEARCH_LOG_SOURCES)[number];

export type SearchLogInput = {
  userId?: string | null;
  sessionId?: string | null;
  queryText?: string | null;
  selectedCategories?: string[];
  filtersApplied?: Record<string, unknown> | null;
  resultCount?: number;
  source: SearchLogSource;
};

export function isSearchLogSource(value: unknown): value is SearchLogSource {
  return (
    typeof value === "string" &&
    SEARCH_LOG_SOURCES.includes(value as SearchLogSource)
  );
}

function normalizeCategories(categories: string[] | undefined) {
  return Array.from(
    new Set(
      (categories ?? [])
        .map((category) => normalizeSearchText(category))
        .filter((category) => category.length > 0),
    ),
  );
}

function normalizeFiltersApplied(
  filtersApplied: Record<string, unknown> | null | undefined,
): Record<string, JsonLike> {
  if (!filtersApplied || typeof filtersApplied !== "object") {
    return {};
  }

  const entries = Object.entries(filtersApplied)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right, "sv-SE"));

  return Object.fromEntries(
    entries.map(([key, value]) => [key, normalizeJsonValue(value)]),
  );
}

function normalizeJsonValue(value: unknown): JsonLike {
  if (value == null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "sv-SE"))
        .map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue)]),
    );
  }

  return String(value);
}

function buildSearchFingerprint(input: {
  queryText: string | null;
  selectedCategories: string[];
  filtersApplied: Record<string, JsonLike>;
  source: SearchLogSource;
}) {
  return JSON.stringify({
    queryText: input.queryText,
    selectedCategories: input.selectedCategories,
    filtersApplied: input.filtersApplied,
    source: input.source,
  });
}

export async function createSearchLog(input: SearchLogInput) {
  const normalizedQuery = normalizeSearchText(input.queryText ?? "");
  const selectedCategories = normalizeCategories(input.selectedCategories);
  const filtersApplied = normalizeFiltersApplied(input.filtersApplied);
  const resultCount =
    typeof input.resultCount === "number" && Number.isFinite(input.resultCount)
      ? Math.max(0, Math.trunc(input.resultCount))
      : 0;
  const userId = input.userId?.trim() || null;
  const sessionId = input.sessionId?.trim() || null;

  if (!userId && !sessionId) {
    return { searchId: null, deduplicated: false, skipped: true };
  }

  if (normalizedQuery.length === 0 && selectedCategories.length === 0) {
    throw new Error("Search log requires a query or at least one category");
  }

  const supabase = createServerClient();
  const fingerprint = buildSearchFingerprint({
    queryText: normalizedQuery || null,
    selectedCategories,
    filtersApplied,
    source: input.source,
  });
  const cutoffIso = new Date(
    Date.now() - SEARCH_LOG_DEDUPE_WINDOW_MS,
  ).toISOString();

  let duplicateQuery = supabase
    .from("auc_user_search_log")
    .select("id, query_text, selected_categories, filters_applied, source")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(10);

  duplicateQuery = userId
    ? duplicateQuery.eq("user_id", userId)
    : duplicateQuery.is("user_id", null).eq("session_id", sessionId!);

  const { data: recentRows, error: recentRowsError } = await duplicateQuery;

  if (recentRowsError) {
    throw new Error(
      `[search-log] Failed to inspect recent searches: ${recentRowsError.message}`,
    );
  }

  const duplicateRow = (recentRows as SearchLogRow[] | null)?.find((row) => {
    const rowFingerprint = buildSearchFingerprint({
      queryText: row.query_text ? normalizeSearchText(row.query_text) : null,
      selectedCategories: normalizeCategories(row.selected_categories ?? []),
      filtersApplied: normalizeFiltersApplied(
        row.filters_applied && typeof row.filters_applied === "object"
          ? (row.filters_applied as Record<string, unknown>)
          : null,
      ),
      source: row.source,
    });

    return rowFingerprint === fingerprint;
  });

  if (duplicateRow) {
    return { searchId: duplicateRow.id, deduplicated: true, skipped: false };
  }

  let queryEmbedding: number[] | null = null;

  if (normalizedQuery && process.env.GEMINI_API_KEY) {
    try {
      queryEmbedding = await generateQueryEmbedding(normalizedQuery);
    } catch (error) {
      console.error("[search-log] Query embedding failed:", error);
    }
  }

  const { data, error } = await supabase
    .from("auc_user_search_log")
    .insert({
      user_id: userId,
      session_id: sessionId,
      query_text: normalizedQuery || null,
      query_embedding: queryEmbedding ? JSON.stringify(queryEmbedding) : null,
      selected_categories: selectedCategories,
      filters_applied: filtersApplied,
      result_count: resultCount,
      source: input.source,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(
      `[search-log] Failed to create search log: ${error.message}`,
    );
  }

  if (userId) {
    try {
      await markUserInterestProfileDirty(userId);
    } catch (dirtyError) {
      console.error("[search-log] Failed to mark interest profile dirty:", dirtyError);
    }
  }

  return {
    searchId: typeof data?.id === "number" ? data.id : null,
    deduplicated: false,
    skipped: false,
  };
}
