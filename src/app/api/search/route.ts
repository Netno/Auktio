import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { generateQueryEmbedding } from "@/lib/embeddings";
import {
  expandSwedishSemanticQueryTerms as expandSemanticTerms,
  extractSwedishQueryTerms as extractQueryTerms,
  normalizeSearchText as normalizeText,
  normalizeSwedishSearchQuery as normalizeSearchQuery,
} from "@/lib/search-language";
import { buildQueryTextMatchClauses } from "@/lib/search-text-match";
import { detectCategoryIntent } from "@/lib/search-category-intent";
import { getDidYouMeanQuery } from "@/lib/search-spelling";
import {
  getQueryUnderstandingSemanticPhrases,
  getQueryUnderstandingTerms,
} from "@/lib/search-query-understanding";
import { rankLotsByRelevance } from "@/lib/search-relevance";
import { FEED_SOURCES } from "@/config/sources";
import type {
  SearchParams,
  SortOption,
  SearchMode,
  SearchStatus,
} from "@/lib/types";

const PAGE_SIZE_DEFAULT = 48;
const PAGE_SIZE_MAX = 100;
const FACET_BATCH_SIZE = 1000;
const DEFAULT_SEARCH_MODE: SearchMode = "hybrid";
const FACET_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LANDING_SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
const SEARCH_STATS_CACHE_TTL_MS = 60 * 1000;

/** 60 requests per minute per IP */
const RATE_LIMIT_CONFIG = { maxRequests: 60, windowMs: 60_000 };

type FacetBundle = {
  categories: Array<{ value: string; count: number }>;
  cities: Array<{ value: string; count: number }>;
  houses: Array<{ value: string; label: string; count: number }>;
};

type SearchResponsePayload = {
  lots: NormalizedLot[];
  total: number;
  page: number | undefined;
  pageSize: number | undefined;
  didYouMean?: string;
  stats: {
    windowCount: number;
    totalValue: number;
    totalValueCurrency: string | null;
    totalValueHasMixedCurrencies: boolean;
  };
  facets: FacetBundle;
};

type ValueStatsRow = Pick<
  SearchRow,
  "currency" | "current_bid" | "sold_price" | "availability" | "end_time"
>;

type SearchStatsPayload = {
  windowCount: number;
  totalValue: number;
  totalValueCurrency: string | null;
  totalValueHasMixedCurrencies: boolean;
};

async function getVerifiedDidYouMean(
  supabase: any,
  params: SearchParams,
  nowIso: string,
) {
  if (!params.query?.trim()) {
    return undefined;
  }

  const correctedQuery = getDidYouMeanQuery(params.query);
  if (!correctedQuery) {
    return undefined;
  }

  const correctedParams: SearchParams = {
    ...params,
    query: correctedQuery,
    searchMode: "keyword",
    sortBy: getDefaultSort(params.status ?? "active", correctedQuery),
    page: 1,
    pageSize: 1,
  };

  let query = supabase.from("auc_lots").select("id", {
    count: "exact",
    head: true,
  });
  query = applySearchCriteria(query, correctedParams, null, nowIso);

  const { count, error } = await query;

  if (error) {
    console.error("[api/search] Did-you-mean verification error:", error);
    return undefined;
  }

  return (count ?? 0) > 0 ? correctedQuery : undefined;
}

const facetCache = new Map<
  SearchStatus,
  { expiresAt: number; value: FacetBundle }
>();
const defaultLandingSearchCache = new Map<
  string,
  {
    expiresAt: number;
    value: SearchResponsePayload;
  }
>();
const searchStatsCache = new Map<
  string,
  {
    expiresAt: number;
    value: SearchStatsPayload;
  }
>();

function getSearchResponseCacheKey(params: SearchParams) {
  return JSON.stringify({
    query: params.query ?? null,
    searchMode: params.searchMode ?? DEFAULT_SEARCH_MODE,
    status: params.status ?? "active",
    auctionIds: params.auctionIds ?? [],
    lotIds: params.lotIds ?? [],
    categories: params.categories ?? [],
    city: params.city ?? null,
    houseId: params.houseId ?? null,
    hasBids: Boolean(params.hasBids),
    soldOnly: Boolean(params.soldOnly),
    minPrice: params.minPrice ?? null,
    maxPrice: params.maxPrice ?? null,
    sortBy: params.sortBy ?? null,
    activeOnly: Boolean(params.activeOnly),
    page: params.page ?? 1,
    pageSize: params.pageSize ?? PAGE_SIZE_DEFAULT,
  });
}

function getSearchStatsCacheKey(
  params: SearchParams,
  vectorLotIds: number[] | null,
) {
  return JSON.stringify({
    query: params.query ?? null,
    searchMode: params.searchMode ?? DEFAULT_SEARCH_MODE,
    status: params.status ?? "active",
    auctionIds: params.auctionIds ?? [],
    lotIds: params.lotIds ?? [],
    categories: params.categories ?? [],
    city: params.city ?? null,
    houseId: params.houseId ?? null,
    hasBids: Boolean(params.hasBids),
    soldOnly: Boolean(params.soldOnly),
    minPrice: params.minPrice ?? null,
    maxPrice: params.maxPrice ?? null,
    activeOnly: Boolean(params.activeOnly),
    vectorLotIds: vectorLotIds ?? [],
  });
}

type SearchRow = {
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
  created_at: string | null;
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

type NormalizedLot = {
  id: number;
  auctionId: number;
  title: string;
  description: string | null;
  categories: string[] | null;
  aiCategories: string[] | null;
  artists: string[] | null;
  images: string[] | null;
  thumbnailUrl: string | null;
  currency: string | null;
  estimate: number | null;
  currentBid: number | null;
  minBid: number | null;
  soldPrice: number | null;
  startTime: string | null;
  endTime: string | null;
  localEndTime: string | null;
  createdAt: string | null;
  city: string | null;
  country: string | null;
  availability: string | null;
  url: string;
  houseId: string | null;
  houseName: string | undefined;
  houseLogoUrl: string | undefined;
  isActive: boolean;
};

type DetectedAuctionHouse = {
  id: string;
  name: string;
  aliases: string[];
};

const HOUSE_MATCHERS: DetectedAuctionHouse[] = FEED_SOURCES.map((source) => {
  const aliases = new Set<string>();
  const normalizedName = normalizeText(source.name);
  const normalizedId = normalizeText(source.id.replace(/-/g, " "));
  const nameWithoutSuffix = normalizedName
    .replace(/\s+auktioner?$/u, "")
    .trim();

  aliases.add(normalizedName);
  aliases.add(normalizedId);

  if (nameWithoutSuffix.length >= 3) {
    aliases.add(nameWithoutSuffix);
  }

  const firstToken = nameWithoutSuffix.split(" ")[0];
  if (firstToken && firstToken.length >= 4) {
    aliases.add(firstToken);
  }

  return {
    id: source.id,
    name: source.name,
    aliases: Array.from(aliases).sort((a, b) => b.length - a.length),
  };
});

function detectAuctionHouseInQuery(query: string) {
  const normalizedQuery = ` ${normalizeText(query)} `;

  for (const house of HOUSE_MATCHERS) {
    const matchedAlias = house.aliases.find((alias) =>
      normalizedQuery.includes(` ${alias} `),
    );

    if (matchedAlias) {
      return { house, matchedAlias };
    }
  }

  return null;
}

function stripAuctionHouseFromQuery(query: string, alias: string) {
  const normalizedQuery = normalizeText(query);
  const stripped = normalizedQuery
    .replace(new RegExp(`(^| )${alias}(?= |$)`, "g"), " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped;
}

function applyStatusFilter(query: any, status: SearchStatus, nowIso: string) {
  switch (status) {
    case "ended":
      return query.or(`end_time.lte.${nowIso},availability.not.is.null`);
    case "all":
      return query;
    case "active":
    default:
      return query.gt("end_time", nowIso).is("availability", null);
  }
}

function isLotActive(row: Pick<SearchRow, "availability" | "end_time">) {
  if (row.availability != null) return false;
  if (!row.end_time) return true;
  return new Date(row.end_time).getTime() > Date.now();
}

function hasPositiveAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getResolvedAvailability(
  row: Pick<SearchRow, "availability" | "sold_price">,
): string | null {
  if (row.availability === "sold" && !hasPositiveAmount(row.sold_price)) {
    return "unsold";
  }

  return row.availability;
}

function getResolvedSoldPrice(value: number | null | undefined): number | null {
  return hasPositiveAmount(value) ? Number(value) : null;
}

function getDefaultSort(status: SearchStatus, query?: string): SortOption {
  if (query?.trim()) return "relevance";
  return status === "ended" ? "recently-ended" : "ending-soon";
}

function normalizeSortForStatus(
  status: SearchStatus,
  sortBy: SortOption,
): SortOption {
  if (status === "ended" && sortBy === "newly-listed") {
    return "recently-ended";
  }

  return sortBy;
}

function buildExpandedSemanticQuery(query: string) {
  const normalizedQuery = normalizeSearchQuery(query);
  const expandedTerms = expandSemanticTerms(query);
  const queryUnderstandingTerms = getQueryUnderstandingTerms(query);
  const semanticPhrases = getQueryUnderstandingSemanticPhrases(query);

  return Array.from(
    new Set(
      [
        normalizedQuery,
        ...expandedTerms,
        ...queryUnderstandingTerms,
        ...semanticPhrases,
      ]
        .flatMap((value) => value.split(" "))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).join(" ");
}

function getSemanticMatchThreshold(query: string) {
  const termCount = extractQueryTerms(query).length;

  if (termCount <= 1) return 0.5;
  if (termCount === 2) return 0.72;
  if (termCount === 3) return 0.66;
  return 0.58;
}

function mergeUniqueIds(...groups: number[][]) {
  const merged: number[] = [];
  const seen = new Set<number>();

  for (const group of groups) {
    for (const id of group) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
  }

  return merged;
}

function getTimestampOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareFavoritesLots(
  left: Pick<NormalizedLot, "id" | "endTime" | "isActive">,
  right: Pick<NormalizedLot, "id" | "endTime" | "isActive">,
) {
  if (left.isActive !== right.isActive) {
    return left.isActive ? -1 : 1;
  }

  const leftEndTime = getTimestampOrNull(left.endTime);
  const rightEndTime = getTimestampOrNull(right.endTime);

  if (left.isActive) {
    if (leftEndTime == null && rightEndTime == null) {
      return right.id - left.id;
    }

    if (leftEndTime == null) {
      return 1;
    }

    if (rightEndTime == null) {
      return -1;
    }

    if (leftEndTime !== rightEndTime) {
      return leftEndTime - rightEndTime;
    }

    return right.id - left.id;
  }

  if (leftEndTime == null && rightEndTime == null) {
    return right.id - left.id;
  }

  if (leftEndTime == null) {
    return 1;
  }

  if (rightEndTime == null) {
    return -1;
  }

  if (leftEndTime !== rightEndTime) {
    return rightEndTime - leftEndTime;
  }

  return right.id - left.id;
}

function getStatusWindowCountFromRows(
  rows: Array<Pick<SearchRow, "end_time" | "availability">>,
  status: SearchStatus,
) {
  return rows.filter((row) => {
    if (!row.end_time) return false;

    const diff = new Date(row.end_time).getTime() - Date.now();
    const isActive =
      row.availability == null && new Date(row.end_time).getTime() > Date.now();

    if (status === "ended") {
      return !isActive && Math.abs(diff) < 86_400_000;
    }

    return diff > 0 && diff < 86_400_000;
  }).length;
}

function applySearchCriteria(
  query: any,
  params: SearchParams,
  vectorLotIds: number[] | null,
  nowIso: string,
) {
  query = applyNonQueryCriteria(query, params, nowIso);

  if (params.query?.trim()) {
    if (params.searchMode === "vector" || params.searchMode === "semantic") {
      if (vectorLotIds?.length) {
        query = query.in("id", vectorLotIds);
      } else {
        query = query.eq("id", -1);
      }
    } else if (params.searchMode === "hybrid") {
      const hybridClauses = [
        `search_text.wfts(swedish).${encodeURIComponent(params.query)}`,
        ...buildQueryTextMatchClauses(params.query),
      ];

      if (vectorLotIds?.length) {
        hybridClauses.unshift(`id.in.(${vectorLotIds.join(",")})`);
        query = query.or(hybridClauses.join(","));
      } else {
        query = query.or(hybridClauses.join(","));
      }
    } else {
      query = query.or(
        [
          `search_text.wfts(swedish).${encodeURIComponent(params.query)}`,
          ...buildQueryTextMatchClauses(params.query),
        ].join(","),
      );
    }
  }

  return query;
}

function buildLexicalCandidateQuery(query: string) {
  const normalizedQuery = normalizeSearchQuery(query);
  const expandedTerms = extractQueryTerms(query);
  const queryUnderstandingTerms = getQueryUnderstandingTerms(query);

  return Array.from(
    new Set(
      [normalizedQuery, ...expandedTerms, ...queryUnderstandingTerms]
        .flatMap((value) => value.split(" "))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).join(" OR ");
}

function applyNonQueryCriteria(
  query: any,
  params: SearchParams,
  nowIso: string,
) {
  const hasExplicitLotIds = Boolean(params.lotIds && params.lotIds.length > 0);

  if (!hasExplicitLotIds) {
    query = applyStatusFilter(query, params.status ?? "active", nowIso);
  }

  if (params.lotIds) {
    if (params.lotIds.length > 0) {
      query = query.in("id", params.lotIds);
    } else {
      query = query.eq("id", -1);
    }
  }

  if (params.auctionIds) {
    if (params.auctionIds.length > 0) {
      query = query.in("auction_id", params.auctionIds);
    } else {
      query = query.eq("auction_id", -1);
    }
  }

  if (params.categories?.length) {
    query = query.overlaps("categories", params.categories);
  }

  if (params.city) {
    query = query.eq("city", params.city);
  }

  if (params.houseId) {
    query = query.eq("house_id", params.houseId);
  }

  if (params.hasBids) {
    query = query.or("current_bid.gt.0,sold_price.gt.0");
  }

  if (params.soldOnly) {
    query = query.eq("availability", "sold");
  }

  if (params.minPrice != null) {
    query = query.gte("current_bid", params.minPrice);
  }

  if (params.maxPrice != null) {
    query = query.lte("current_bid", params.maxPrice);
  }

  return query;
}

async function getLexicalCandidateIds(
  supabase: any,
  params: SearchParams,
  nowIso: string,
) {
  if (!params.query?.trim()) {
    return [];
  }

  const expandedQuery = buildExpandedSemanticQuery(params.query);
  const lexicalQuery = buildLexicalCandidateQuery(params.query);
  if (!lexicalQuery) {
    return [];
  }

  let query = supabase.from("auc_lots").select("id");
  query = applyNonQueryCriteria(query, params, nowIso);
  query = query
    .or(
      [
        `search_text.wfts(swedish).${encodeURIComponent(lexicalQuery)}`,
        ...buildQueryTextMatchClauses(params.query),
      ].join(","),
    )
    .limit(120);

  const { data, error } = await query;

  if (error) {
    console.warn("[api/search] Lexical candidate lookup failed:", error);
    return [];
  }

  const lexicalIds = (data ?? [])
    .map((row: { id: number | null }) => row.id)
    .filter((id: number | null): id is number => Number.isFinite(id));

  const aiCategoryTerms = Array.from(
    new Set(
      [
        normalizeSearchQuery(params.query),
        ...expandSemanticTerms(params.query),
        ...getQueryUnderstandingTerms(params.query),
      ]
        .flatMap((value) => value.split(" "))
        .map((value) => value.trim())
        .filter((value) => value.length >= 3),
    ),
  );

  if (!aiCategoryTerms.length) {
    return lexicalIds;
  }

  let aiCategoryQuery = supabase.from("auc_lots").select("id");
  aiCategoryQuery = applyNonQueryCriteria(aiCategoryQuery, params, nowIso);
  aiCategoryQuery = aiCategoryQuery
    .overlaps("ai_categories", aiCategoryTerms)
    .limit(120);

  const { data: aiCategoryData, error: aiCategoryError } =
    await aiCategoryQuery;

  if (aiCategoryError) {
    console.warn(
      "[api/search] AI-category candidate lookup failed:",
      aiCategoryError,
    );
    return lexicalIds;
  }

  const aiCategoryIds = (aiCategoryData ?? [])
    .map((row: { id: number | null }) => row.id)
    .filter((id: number | null): id is number => Number.isFinite(id));

  return mergeUniqueIds(lexicalIds, aiCategoryIds);
}

async function fetchAllRows<T>(
  buildQuery: () => any,
  batchSize = FACET_BATCH_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery().range(
      offset,
      offset + batchSize - 1,
    );

    if (error) {
      throw error;
    }

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return rows;
}

async function getWindowCount(
  supabase: any,
  params: SearchParams,
  vectorLotIds: number[] | null,
  nowIso: string,
) {
  const nowDate = new Date(nowIso);
  const windowStartIso = new Date(nowDate.getTime() - 86_400_000).toISOString();
  const windowEndIso = new Date(nowDate.getTime() + 86_400_000).toISOString();

  let query = supabase.from("auc_lots").select("id", {
    count: "exact",
    head: true,
  });

  query = applySearchCriteria(query, params, vectorLotIds, nowIso);

  if (params.status === "ended") {
    query = query.gte("end_time", windowStartIso).lte("end_time", nowIso);
  } else if (params.status === "all") {
    query = query.gte("end_time", nowIso).lte("end_time", windowEndIso);
  } else {
    query = query.lte("end_time", windowEndIso);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function getTotalValueStats(
  supabase: any,
  params: SearchParams,
  vectorLotIds: number[] | null,
  nowIso: string,
) {
  const rows = await fetchAllRows<ValueStatsRow>(() => {
    let query = supabase.from("auc_lots").select(`
        currency, current_bid, sold_price, end_time, availability
      `);

    query = applySearchCriteria(query, params, vectorLotIds, nowIso);
    return query.order("id", { ascending: true });
  });

  const valueRows = rows
    .map((row) => {
      const resolvedAvailability = getResolvedAvailability(row);
      const amount = isLotActive(row)
        ? row.current_bid
        : resolvedAvailability === "sold"
          ? getResolvedSoldPrice(row.sold_price)
          : row.current_bid;

      return {
        amount,
        currency: (row.currency || "SEK").toUpperCase(),
      };
    })
    .filter(
      (row): row is { amount: number; currency: string } => row.amount != null,
    );

  const currencies = Array.from(new Set(valueRows.map((row) => row.currency)));

  return {
    totalValue: valueRows.reduce((sum, row) => sum + row.amount, 0),
    totalValueCurrency: currencies[0] ?? null,
    totalValueHasMixedCurrencies: currencies.length > 1,
  };
}

async function getCachedSearchStats(
  supabase: any,
  params: SearchParams,
  vectorLotIds: number[] | null,
  nowIso: string,
): Promise<SearchStatsPayload> {
  const cacheKey = getSearchStatsCacheKey(params, vectorLotIds);
  const cached = searchStatsCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const [windowCount, totalValueStats] = await Promise.all([
    getWindowCount(supabase, params, vectorLotIds, nowIso),
    getTotalValueStats(supabase, params, vectorLotIds, nowIso),
  ]);

  const value = {
    windowCount,
    totalValue: totalValueStats.totalValue,
    totalValueCurrency: totalValueStats.totalValueCurrency,
    totalValueHasMixedCurrencies: totalValueStats.totalValueHasMixedCurrencies,
  };

  searchStatsCache.set(cacheKey, {
    expiresAt: now + SEARCH_STATS_CACHE_TTL_MS,
    value,
  });

  return value;
}

async function getFacetBundle(supabase: any, status: SearchStatus) {
  const cached = facetCache.get(status);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const [categories, cities, houses] = await Promise.all([
    getCategoryFacets(supabase, status),
    getCityFacets(supabase, status),
    getHouseFacets(supabase, status),
  ]);

  const value = { categories, cities, houses };
  facetCache.set(status, {
    expiresAt: now + FACET_CACHE_TTL_MS,
    value,
  });

  return value;
}

function isDefaultLandingSearch(params: SearchParams) {
  return (
    !params.query &&
    !params.auctionIds?.length &&
    !params.lotIds?.length &&
    !params.categories?.length &&
    !params.city &&
    !params.houseId &&
    !params.hasBids &&
    params.minPrice == null &&
    params.maxPrice == null &&
    (params.status ?? "active") === "active" &&
    (params.page ?? 1) === 1 &&
    (params.pageSize ?? PAGE_SIZE_DEFAULT) === PAGE_SIZE_DEFAULT &&
    (params.sortBy ?? "ending-soon") === "ending-soon"
  );
}

/**
 * GET /api/search?q=...&categories=...&city=...&sort=...&page=...
 *
 * Full-text search with faceted filtering.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = rateLimit(`search:${ip}`, RATE_LIMIT_CONFIG);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      },
    );
  }
  const { searchParams } = new URL(request.url);
  const supabase = createServerClient();
  const favoritesMode = searchParams.get("favoritesMode") === "true";

  // Parse params
  const statusParam = searchParams.get("status");
  const status: SearchStatus =
    statusParam === "ended" || statusParam === "all" || statusParam === "active"
      ? statusParam
      : searchParams.get("activeOnly") === "false"
        ? "all"
        : "active";
  const params: SearchParams = {
    query: searchParams.get("q") ?? undefined,
    searchMode: (searchParams.get("mode") as SearchMode) ?? DEFAULT_SEARCH_MODE,
    status,
    auctionIds: searchParams
      .get("auctionId")
      ?.split(",")
      .filter((value) => value.trim().length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
    lotIds: searchParams
      .get("ids")
      ?.split(",")
      .filter((value) => value.trim().length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
    categories: searchParams.get("categories")?.split(",").filter(Boolean),
    city: searchParams.get("city") ?? undefined,
    houseId: searchParams.get("houseId") ?? undefined,
    hasBids: searchParams.get("hasBids") === "true",
    soldOnly: searchParams.get("soldOnly") === "true",
    minPrice: searchParams.get("minPrice")
      ? Number(searchParams.get("minPrice"))
      : undefined,
    maxPrice: searchParams.get("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : undefined,
    sortBy: normalizeSortForStatus(
      status,
      (searchParams.get("sort") as SortOption) ??
        getDefaultSort(status, searchParams.get("q") ?? undefined),
    ),
    activeOnly: status === "active",
    page: Math.max(1, Number(searchParams.get("page")) || 1),
    pageSize: Math.min(
      PAGE_SIZE_MAX,
      Math.max(1, Number(searchParams.get("pageSize")) || PAGE_SIZE_DEFAULT),
    ),
  };

  const detectedHouseMatch = params.query
    ? detectAuctionHouseInQuery(params.query)
    : null;
  const effectiveQuery = detectedHouseMatch
    ? stripAuctionHouseFromQuery(
        params.query ?? "",
        detectedHouseMatch.matchedAlias,
      )
    : params.query?.trim();
  const detectedCategory = detectCategoryIntent(effectiveQuery);
  const shouldTreatAsCategoryBrowse = Boolean(
    detectedCategory && effectiveQuery && normalizeSearchQuery(effectiveQuery),
  );
  const effectiveParams: SearchParams = {
    ...params,
    query: shouldTreatAsCategoryBrowse
      ? undefined
      : effectiveQuery?.trim() || undefined,
    categories:
      params.categories?.length || !detectedCategory
        ? params.categories
        : [detectedCategory],
    houseId: params.houseId ?? detectedHouseMatch?.house.id,
  };

  const defaultLandingSearch = isDefaultLandingSearch(effectiveParams);
  const searchResponseCacheKey = defaultLandingSearch
    ? getSearchResponseCacheKey(effectiveParams)
    : null;
  const nowMs = Date.now();

  if (defaultLandingSearch && searchResponseCacheKey) {
    const cached = defaultLandingSearchCache.get(searchResponseCacheKey);
    if (cached && cached.expiresAt > nowMs) {
      const response = NextResponse.json(cached.value);
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=180, stale-while-revalidate=600",
      );
      return response;
    }
  }

  const offset = (effectiveParams.page! - 1) * effectiveParams.pageSize!;
  const nowIso = new Date().toISOString();
  const needsVector =
    effectiveParams.query?.trim() &&
    (effectiveParams.searchMode === "vector" ||
      effectiveParams.searchMode === "hybrid" ||
      effectiveParams.searchMode === "semantic");

  try {
    // ── Vector/hybrid: get matching lot IDs via embedding ──
    let vectorLotIds: number[] | null = null;

    if (needsVector) {
      const expandedSemanticQuery = buildExpandedSemanticQuery(
        effectiveParams.query!,
      );
      const [queryEmbedding, lexicalCandidateIds] = await Promise.all([
        generateQueryEmbedding(expandedSemanticQuery || effectiveParams.query!),
        effectiveParams.searchMode === "hybrid"
          ? getLexicalCandidateIds(supabase, effectiveParams, nowIso)
          : Promise.resolve([]),
      ]);

      const { data: vectorData } = await supabase.rpc(
        "auc_semantic_search_lots",
        {
          query_embedding: JSON.stringify(queryEmbedding),
          match_threshold: getSemanticMatchThreshold(effectiveParams.query!),
          match_count: 200,
        },
      );

      const semanticIds = (vectorData ?? []).map(
        (d: any) => d.lot_id as number,
      );
      vectorLotIds =
        effectiveParams.searchMode === "hybrid"
          ? mergeUniqueIds(semanticIds, lexicalCandidateIds)
          : semanticIds;
    }

    // ── Build main query ──
    let query = supabase.from("auc_lots").select(
      `
        id, title, description, categories, ai_categories, artists,
        auction_id,
        images, thumbnail_url, currency, estimate, current_bid,
        min_bid, sold_price, start_time, end_time, local_end_time,
        created_at, city, country, availability, url, house_id,
        auc_auction_houses!inner(name, logo_url)
      `,
      { count: "exact" },
    );
    query = applySearchCriteria(query, effectiveParams, vectorLotIds, nowIso);

    // For vector/semantic mode: sort by relevance (client-side) — fetch all matches
    const useRelevanceSort =
      Boolean(effectiveParams.query?.trim()) &&
      ((effectiveParams.sortBy ?? "relevance") === "relevance" ||
        (needsVector && Boolean(vectorLotIds?.length)));
    const useFavoritesSort =
      favoritesMode &&
      Boolean(effectiveParams.lotIds?.length) &&
      !effectiveParams.query?.trim();
    const useClientSideSort = useRelevanceSort || useFavoritesSort;

    if (!useClientSideSort) {
      // DB-level sorting
      switch (params.sortBy) {
        case "ending-soon":
          query = query.order("end_time", { ascending: true });
          break;
        case "recently-ended":
          query = query.order("end_time", { ascending: false });
          break;
        case "recently-sold":
          query = query
            .order("availability", { ascending: true, nullsFirst: false })
            .order("end_time", { ascending: false });
          break;
        case "newly-listed":
          query = query.order("created_at", { ascending: false });
          break;
        case "price-asc":
          query = query.order("current_bid", {
            ascending: true,
            nullsFirst: false,
          });
          break;
        case "price-desc":
          query = query.order("current_bid", {
            ascending: false,
            nullsFirst: false,
          });
          break;
        case "sold-price-desc":
          query = query.order("current_bid", {
            ascending: false,
            nullsFirst: false,
          });
          break;
        case "estimate-desc":
          query = query.order("estimate", {
            ascending: false,
            nullsFirst: false,
          });
          break;
        default:
          query = query.order("end_time", { ascending: true });
      }
      // DB-level pagination
      query = query.range(offset, offset + effectiveParams.pageSize! - 1);
    }

    const [{ data, count, error }, searchStats, facetBundle] =
      await Promise.all([
        query,
        getCachedSearchStats(supabase, effectiveParams, vectorLotIds, nowIso),
        getFacetBundle(supabase, params.status ?? "active"),
      ]);

    if (error) {
      console.error("[api/search] Query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Normalize response
    const allRows: NormalizedLot[] = ((data ?? []) as SearchRow[]).map(
      (row) => ({
        id: row.id,
        auctionId: row.auction_id,
        title: row.title,
        description: row.description,
        categories: row.categories,
        aiCategories: row.ai_categories,
        artists: row.artists,
        images: row.images,
        thumbnailUrl: row.thumbnail_url,
        currency: row.currency,
        estimate: row.estimate,
        currentBid: row.current_bid,
        minBid: row.min_bid,
        soldPrice: getResolvedSoldPrice(row.sold_price),
        startTime: row.start_time,
        endTime: row.end_time,
        localEndTime: row.local_end_time,
        createdAt: row.created_at,
        city: row.city,
        country: row.country,
        availability: getResolvedAvailability(row),
        url: row.url,
        houseId: row.house_id,
        houseName: row.auc_auction_houses?.name ?? undefined,
        houseLogoUrl: row.auc_auction_houses?.logo_url ?? undefined,
        isActive: isLotActive(row),
      }),
    );

    // For vector mode: sort by semantic relevance, paginate client-side
    let lots, resultTotal;
    if (useRelevanceSort) {
      const vectorOrder = new Map(
        (vectorLotIds ?? []).map((id, idx) => [id, idx]),
      );
      const finalRankedRows = rankLotsByRelevance(
        allRows,
        effectiveParams.query ?? "",
        params.sortBy ?? "relevance",
        { vectorOrder },
      );
      resultTotal = finalRankedRows.length;
      lots = finalRankedRows.slice(offset, offset + params.pageSize!);
    } else if (useFavoritesSort) {
      const sortedFavorites = [...allRows].sort(compareFavoritesLots);
      resultTotal = sortedFavorites.length;
      lots = sortedFavorites.slice(offset, offset + params.pageSize!);
    } else {
      lots = allRows;
      resultTotal = count ?? 0;
    }

    const didYouMean =
      resultTotal === 0
        ? await getVerifiedDidYouMean(supabase, effectiveParams, nowIso)
        : undefined;

    const payload: SearchResponsePayload = {
      lots,
      total: resultTotal,
      page: effectiveParams.page,
      pageSize: effectiveParams.pageSize,
      didYouMean,
      stats: searchStats,
      facets: {
        categories: facetBundle.categories,
        cities: facetBundle.cities,
        houses: facetBundle.houses,
      },
    };

    if (defaultLandingSearch && searchResponseCacheKey) {
      defaultLandingSearchCache.set(searchResponseCacheKey, {
        expiresAt: nowMs + DEFAULT_LANDING_SEARCH_CACHE_TTL_MS,
        value: payload,
      });
    }

    const response = NextResponse.json(payload);

    if (defaultLandingSearch) {
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=180, stale-while-revalidate=600",
      );
    }

    return response;
  } catch (error) {
    console.error("[api/search] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function getCategoryFacets(supabase: any, status: SearchStatus) {
  const data = await fetchAllRows<{ categories: string[] | null }>(() => {
    let query = supabase.from("auc_lots").select("categories");
    return applyStatusFilter(query, status, new Date().toISOString());
  });

  const counts: Record<string, number> = {};
  for (const row of data) {
    for (const category of row.categories ?? []) {
      counts[category] = (counts[category] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

async function getCityFacets(supabase: any, status: SearchStatus) {
  const data = await fetchAllRows<{ city: string }>(() => {
    let query = supabase
      .from("auc_lots")
      .select("city")
      .not("city", "is", null);
    return applyStatusFilter(query, status, new Date().toISOString());
  });

  // Count manually since Supabase doesn't support GROUP BY easily
  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.city] = (counts[row.city] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

async function getHouseFacets(supabase: any, status: SearchStatus) {
  const data = await fetchAllRows<{
    house_id: string;
    auc_auction_houses?: { name?: string | null } | null;
  }>(() => {
    let query = supabase
      .from("auc_lots")
      .select("house_id, auc_auction_houses(name)")
      .not("house_id", "is", null);

    return applyStatusFilter(query, status, new Date().toISOString());
  });

  const counts: Record<string, { name: string; count: number }> = {};
  for (const row of data) {
    const houseId = row.house_id;
    if (!counts[houseId]) {
      counts[houseId] = {
        name: row.auc_auction_houses?.name ?? houseId,
        count: 0,
      };
    }
    counts[houseId].count++;
  }
  return Object.entries(counts)
    .map(([value, { name, count }]) => ({ value, label: name, count }))
    .sort((a, b) => b.count - a.count);
}
