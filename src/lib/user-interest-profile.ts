import { createServerClient } from "@/lib/supabase";
import { isMissingSupabaseTableError } from "@/lib/supabase-table-errors";

type FavoriteSignalRow = {
  embedding: unknown;
  categories: string[] | null;
  ai_categories: string[] | null;
  availability: string | null;
  current_bid: number | string | null;
  sold_price: number | string | null;
  estimate: number | string | null;
};

type SearchSignalRow = {
  query_embedding: unknown;
  selected_categories: string[] | null;
  filters_applied: Record<string, unknown> | null;
  created_at: string;
};

function parseEmbedding(value: unknown) {
  if (Array.isArray(value)) {
    const vector = value.filter(
      (item): item is number =>
        typeof item === "number" && Number.isFinite(item),
    );

    return vector.length > 0 ? vector : null;
  }

  if (typeof value === "string") {
    try {
      return parseEmbedding(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return null;
}

function toPositiveNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function buildWeightedCentroid(
  signals: Array<{ embedding: number[]; weight: number }>,
) {
  const validSignals = signals.filter(
    (signal) => signal.weight > 0 && signal.embedding.length > 0,
  );

  if (validSignals.length === 0) {
    return null;
  }

  const dimensions = validSignals[0].embedding.length;
  const totals = new Array<number>(dimensions).fill(0);
  let totalWeight = 0;

  for (const signal of validSignals) {
    if (signal.embedding.length !== dimensions) {
      continue;
    }

    totalWeight += signal.weight;

    for (let index = 0; index < dimensions; index += 1) {
      totals[index] += signal.embedding[index] * signal.weight;
    }
  }

  if (totalWeight <= 0) {
    return null;
  }

  const centroid = totals.map((value) => value / totalWeight);
  const magnitude = Math.sqrt(
    centroid.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude <= 0) {
    return centroid;
  }

  return centroid.map((value) => value / magnitude);
}

function getFavoriteWeight(row: FavoriteSignalRow) {
  if (row.availability === "sold") {
    return 4;
  }

  return 3;
}

function getSearchWeight(createdAt: string) {
  const createdAtMs = new Date(createdAt).getTime();

  if (!Number.isFinite(createdAtMs)) {
    return 1;
  }

  const ageInDays = Math.max(
    0,
    (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24),
  );
  return Math.max(0.35, 1.5 - ageInDays / 45);
}

function buildTopCategories(categoryWeights: Map<string, number>) {
  return [...categoryWeights.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0], "sv-SE");
    })
    .slice(0, 8)
    .map(([category]) => category);
}

function buildPriceRange(prices: number[]) {
  const validPrices = prices.filter(
    (price) => Number.isFinite(price) && price > 0,
  );

  if (validPrices.length === 0) {
    return {};
  }

  const sorted = [...validPrices].sort((left, right) => left - right);
  const lowerIndex = Math.floor((sorted.length - 1) * 0.25);
  const upperIndex = Math.floor((sorted.length - 1) * 0.75);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    suggestedMin: sorted[lowerIndex],
    suggestedMax: sorted[upperIndex],
  };
}

export async function computeAndStoreUserInterestProfile(userId: string) {
  const supabase = createServerClient();

  const [
    { data: favorites, error: favoritesError },
    { data: searches, error: searchesError },
  ] = await Promise.all([
    supabase
      .from("auc_user_favorites")
      .select(
        "auc_lots(embedding, categories, ai_categories, availability, current_bid, sold_price, estimate)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("auc_user_search_log")
      .select(
        "query_embedding, selected_categories, filters_applied, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (favoritesError) {
    throw new Error(
      `[interest-profile] Failed to load favorite signals: ${favoritesError.message}`,
    );
  }

  const shouldIgnoreMissingSearchLogTable = isMissingSupabaseTableError(
    searchesError,
    "auc_user_search_log",
  );

  if (searchesError && !shouldIgnoreMissingSearchLogTable) {
    throw new Error(
      `[interest-profile] Failed to load search signals: ${searchesError.message}`,
    );
  }

  if (shouldIgnoreMissingSearchLogTable) {
    console.warn(
      "[interest-profile] Search log table is missing; building profile from favorites only.",
    );
  }

  const favoriteRows = (favorites ?? [])
    .flatMap((row) =>
      Array.isArray(row.auc_lots) ? row.auc_lots : [row.auc_lots],
    )
    .filter((row): row is FavoriteSignalRow => Boolean(row));
  const searchRows = shouldIgnoreMissingSearchLogTable
    ? []
    : ((searches ?? []) as SearchSignalRow[]);
  const vectorSignals: Array<{ embedding: number[]; weight: number }> = [];
  const categoryWeights = new Map<string, number>();
  const prices: number[] = [];
  let activeFavoriteCount = 0;
  let soldFavoriteCount = 0;

  for (const row of favoriteRows) {
    const weight = getFavoriteWeight(row);
    const embedding = parseEmbedding(row.embedding);

    if (embedding) {
      vectorSignals.push({ embedding, weight });
    }

    if (row.availability === "sold") {
      soldFavoriteCount += 1;
    } else {
      activeFavoriteCount += 1;
    }

    for (const category of [
      ...(row.ai_categories ?? []),
      ...(row.categories ?? []),
    ]) {
      const normalizedCategory = category.trim();

      if (!normalizedCategory) {
        continue;
      }

      categoryWeights.set(
        normalizedCategory,
        (categoryWeights.get(normalizedCategory) ?? 0) + weight,
      );
    }

    for (const priceCandidate of [
      row.current_bid,
      row.sold_price,
      row.estimate,
    ]) {
      const price = toPositiveNumber(priceCandidate);

      if (price != null) {
        prices.push(price);
      }
    }
  }

  for (const row of searchRows) {
    const weight = getSearchWeight(row.created_at);
    const embedding = parseEmbedding(row.query_embedding);

    if (embedding) {
      vectorSignals.push({ embedding, weight });
    }

    for (const category of row.selected_categories ?? []) {
      const normalizedCategory = category.trim();

      if (!normalizedCategory) {
        continue;
      }

      categoryWeights.set(
        normalizedCategory,
        (categoryWeights.get(normalizedCategory) ?? 0) + weight,
      );
    }

    const filtersApplied =
      row.filters_applied && typeof row.filters_applied === "object"
        ? row.filters_applied
        : {};

    for (const priceCandidate of [
      filtersApplied.minPrice,
      filtersApplied.maxPrice,
    ]) {
      const price = toPositiveNumber(priceCandidate);

      if (price != null) {
        prices.push(price);
      }
    }
  }

  const centroidEmbedding = buildWeightedCentroid(vectorSignals);
  const sourceBreakdown = {
    activeFavoriteCount,
    soldFavoriteCount,
    searchCount: searchRows.length,
    vectorSignalCount: vectorSignals.length,
  };
  const topCategories = buildTopCategories(categoryWeights);
  const avgPriceRange = buildPriceRange(prices);
  const nowIso = new Date().toISOString();

  const { error: upsertError } = await supabase
    .from("auc_user_interest_profiles")
    .upsert(
      {
        user_id: userId,
        centroid_embedding: centroidEmbedding
          ? JSON.stringify(centroidEmbedding)
          : null,
        source_breakdown: sourceBreakdown,
        top_categories: topCategories,
        avg_price_range: avgPriceRange,
        is_dirty: false,
        updated_at: nowIso,
      },
      { onConflict: "user_id" },
    );

  if (upsertError) {
    throw new Error(
      `[interest-profile] Failed to store interest profile: ${upsertError.message}`,
    );
  }

  return {
    hasCentroid: Boolean(centroidEmbedding),
    sourceBreakdown,
    topCategories,
    avgPriceRange,
  };
}
