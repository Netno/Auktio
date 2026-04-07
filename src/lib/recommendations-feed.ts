import { createServerClient } from "@/lib/supabase";
import { refreshUserRecommendationMatches } from "@/lib/user-recommendation-matches";
import type { Lot } from "@/lib/types";

const RECOMMENDATION_STALE_MS = 1000 * 60 * 60 * 6;

type RecommendationProfileRow = {
  is_dirty: boolean | null;
  updated_at: string | null;
  top_categories: string[] | null;
  source_breakdown: Record<string, unknown> | null;
  avg_price_range: Record<string, unknown> | null;
};

type RecommendationMatchRow = {
  lot_id: number;
  score: number;
};

type RecommendationLotRow = {
  id: number;
  auction_id: number;
  title: string;
  description: string | null;
  categories: string[] | null;
  ai_categories: string[] | null;
  artists: string[] | null;
  images: string[] | null;
  thumbnail_url: string | null;
  currency: string | null;
  estimate: number | null;
  current_bid: number | null;
  min_bid: number | null;
  sold_price: number | null;
  start_time: string | null;
  end_time: string | null;
  local_end_time: string | null;
  city: string | null;
  country: string | null;
  availability: string | null;
  url: string;
  house_id: string | null;
  auc_auction_houses?: {
    name?: string | null;
    logo_url?: string | null;
  } | null;
};

function isProfileStale(updatedAt: string | null | undefined) {
  if (!updatedAt) {
    return true;
  }

  const updatedAtMs = new Date(updatedAt).getTime();

  if (!Number.isFinite(updatedAtMs)) {
    return true;
  }

  return Date.now() - updatedAtMs > RECOMMENDATION_STALE_MS;
}

function isLotActive(row: RecommendationLotRow) {
  if (row.availability === "sold" || row.availability === "withdrawn") {
    return false;
  }

  if (!row.end_time) {
    return true;
  }

  const endTimeMs = new Date(row.end_time).getTime();

  return !Number.isFinite(endTimeMs) || endTimeMs > Date.now();
}

function mapLotRow(row: RecommendationLotRow): Lot {
  return {
    id: row.id,
    auctionId: row.auction_id,
    houseId: row.house_id ?? "",
    title: row.title,
    description: row.description ?? undefined,
    url: row.url,
    categories: row.categories ?? [],
    aiCategories: row.ai_categories ?? [],
    artists: row.artists ?? [],
    images: row.images ?? [],
    thumbnailUrl: row.thumbnail_url ?? undefined,
    currency: row.currency ?? "SEK",
    estimate: row.estimate ?? undefined,
    currentBid: row.current_bid ?? undefined,
    minBid: row.min_bid ?? undefined,
    soldPrice: row.sold_price ?? undefined,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    localEndTime: row.local_end_time ?? undefined,
    city: row.city ?? undefined,
    country: row.country ?? "SE",
    availability: row.availability ?? undefined,
    isActive: isLotActive(row),
    houseName: row.auc_auction_houses?.name ?? undefined,
    houseLogoUrl: row.auc_auction_houses?.logo_url ?? undefined,
  };
}

export async function loadUserRecommendations(params: {
  userId: string;
  forceRefresh?: boolean;
  limit?: number;
}) {
  const supabase = createServerClient();
  const limit =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.max(1, Math.trunc(params.limit))
      : 6;

  let { data: profile, error: profileError } = await supabase
    .from("auc_user_interest_profiles")
    .select(
      "is_dirty, updated_at, top_categories, source_breakdown, avg_price_range",
    )
    .eq("user_id", params.userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `[recommendations-feed] Failed to load interest profile: ${profileError.message}`,
    );
  }

  let { data: rawMatches, error: matchesError } = await supabase
    .from("auc_user_matches")
    .select("lot_id, score")
    .eq("user_id", params.userId)
    .order("score", { ascending: false })
    .limit(limit * 3);

  if (matchesError) {
    throw new Error(
      `[recommendations-feed] Failed to load recommendation matches: ${matchesError.message}`,
    );
  }

  const shouldRefresh =
    params.forceRefresh === true ||
    profile?.is_dirty === true ||
    (profile ? isProfileStale(profile.updated_at) : false) ||
    (rawMatches ?? []).length === 0;

  let refreshed = false;

  if (shouldRefresh) {
    await refreshUserRecommendationMatches(params.userId);
    refreshed = true;

    const refreshedProfileResult = await supabase
      .from("auc_user_interest_profiles")
      .select(
        "is_dirty, updated_at, top_categories, source_breakdown, avg_price_range",
      )
      .eq("user_id", params.userId)
      .maybeSingle();

    if (refreshedProfileResult.error) {
      throw new Error(
        `[recommendations-feed] Failed to reload interest profile: ${refreshedProfileResult.error.message}`,
      );
    }

    profile = refreshedProfileResult.data as RecommendationProfileRow | null;

    const refreshedMatchesResult = await supabase
      .from("auc_user_matches")
      .select("lot_id, score")
      .eq("user_id", params.userId)
      .order("score", { ascending: false })
      .limit(limit * 3);

    if (refreshedMatchesResult.error) {
      throw new Error(
        `[recommendations-feed] Failed to reload recommendation matches: ${refreshedMatchesResult.error.message}`,
      );
    }

    rawMatches = refreshedMatchesResult.data as RecommendationMatchRow[] | null;
  }

  const lotIdsInOrder = (rawMatches ?? [])
    .map((row) => Number(row.lot_id))
    .filter((lotId) => Number.isInteger(lotId) && lotId > 0);

  if (lotIdsInOrder.length === 0) {
    return {
      lots: [] as Lot[],
      refreshed,
      topCategories: profile?.top_categories ?? [],
      sourceBreakdown: profile?.source_breakdown ?? {},
      avgPriceRange: profile?.avg_price_range ?? {},
      updatedAt: profile?.updated_at ?? null,
    };
  }

  const { data: lotRows, error: lotRowsError } = await supabase
    .from("auc_lots")
    .select(
      "id, auction_id, title, description, categories, ai_categories, artists, images, thumbnail_url, currency, estimate, current_bid, min_bid, sold_price, start_time, end_time, local_end_time, city, country, availability, url, house_id, auc_auction_houses(name, logo_url)",
    )
    .in("id", lotIdsInOrder);

  if (lotRowsError) {
    throw new Error(
      `[recommendations-feed] Failed to load recommendation lots: ${lotRowsError.message}`,
    );
  }

  const lotsById = new Map(
    ((lotRows ?? []) as RecommendationLotRow[])
      .filter((row) => isLotActive(row))
      .map((row) => [row.id, mapLotRow(row)]),
  );

  const lots = lotIdsInOrder
    .map((lotId) => lotsById.get(lotId))
    .filter((lot): lot is Lot => Boolean(lot))
    .slice(0, limit);

  return {
    lots,
    refreshed,
    topCategories: profile?.top_categories ?? [],
    sourceBreakdown: profile?.source_breakdown ?? {},
    avgPriceRange: profile?.avg_price_range ?? {},
    updatedAt: profile?.updated_at ?? null,
  };
}
