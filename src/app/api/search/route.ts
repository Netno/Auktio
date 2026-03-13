import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { generateQueryEmbedding } from "@/lib/embeddings";
import {
  buildSwedishWordRoots as buildWordRoots,
  extractSwedishQueryTerms as extractQueryTerms,
  normalizeSearchText as normalizeText,
  normalizeSwedishSearchQuery as normalizeSearchQuery,
} from "@/lib/search-language";
import { FEED_SOURCES } from "@/config/sources";
import type {
  SearchParams,
  SortOption,
  SearchMode,
  SearchStatus,
} from "@/lib/types";

const PAGE_SIZE_DEFAULT = 40;
const PAGE_SIZE_MAX = 100;
const FACET_BATCH_SIZE = 1000;
const DEFAULT_SEARCH_MODE: SearchMode = "hybrid";
const FACET_CACHE_TTL_MS = 5 * 60 * 1000;

/** 60 requests per minute per IP */
const RATE_LIMIT_CONFIG = { maxRequests: 60, windowMs: 60_000 };

type FacetBundle = {
  categories: Array<{ value: string; count: number }>;
  cities: Array<{ value: string; count: number }>;
  houses: Array<{ value: string; label: string; count: number }>;
};

const facetCache = new Map<
  SearchStatus,
  { expiresAt: number; value: FacetBundle }
>();

type SearchRow = {
  id: number;
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

function getLexicalScore(lot: NormalizedLot, queryTerms: string[]) {
  if (!queryTerms.length) {
    return 0;
  }

  const titleTokens = normalizeText(lot.title ?? "")
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));
  const categoryTokens = normalizeText((lot.categories ?? []).join(" "))
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));
  const descriptionTokens = normalizeText(lot.description ?? "")
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));

  const matchesTerm = (tokens: string[], term: string) =>
    tokens.some((token) => token === term || token.endsWith(term));

  let score = 0;
  for (const term of queryTerms) {
    if (matchesTerm(titleTokens, term)) {
      score += 4;
    } else if (matchesTerm(categoryTokens, term)) {
      score += 2;
    } else if (matchesTerm(descriptionTokens, term)) {
      score += 1;
    }
  }

  return score;
}

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

function compareNumbers(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: "asc" | "desc",
) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === "asc" ? a - b : b - a;
}

function compareDates(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: "asc" | "desc",
) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();
  return direction === "asc" ? aTime - bTime : bTime - aTime;
}

function sortLots(
  lots: NormalizedLot[],
  sortBy: SortOption,
  relevanceOrder?: Map<number, number>,
) {
  lots.sort((a, b) => {
    switch (sortBy) {
      case "recently-ended":
        return compareDates(a.endTime, b.endTime, "desc");
      case "newly-listed":
        return compareDates(a.createdAt, b.createdAt, "desc");
      case "price-asc":
        return compareNumbers(a.currentBid, b.currentBid, "asc");
      case "price-desc":
        return compareNumbers(a.currentBid, b.currentBid, "desc");
      case "estimate-desc":
        return compareNumbers(a.estimate, b.estimate, "desc");
      case "relevance":
        if (relevanceOrder) {
          return (
            (relevanceOrder.get(a.id) ?? Infinity) -
            (relevanceOrder.get(b.id) ?? Infinity)
          );
        }
        return 0;
      case "ending-soon":
      default:
        return compareDates(a.endTime, b.endTime, "asc");
    }
  });
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

function isLotActive(row: SearchRow) {
  if (row.availability != null) return false;
  if (!row.end_time) return true;
  return new Date(row.end_time).getTime() > Date.now();
}

function getDefaultSort(status: SearchStatus, query?: string): SortOption {
  if (query?.trim()) return "relevance";
  return status === "ended" ? "recently-ended" : "ending-soon";
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
  query = applyStatusFilter(query, params.status ?? "active", nowIso);

  if (params.query?.trim()) {
    if (params.searchMode === "vector" || params.searchMode === "semantic") {
      if (vectorLotIds?.length) {
        query = query.in("id", vectorLotIds);
      } else {
        query = query.eq("id", -1);
      }
    } else if (params.searchMode === "hybrid") {
      if (vectorLotIds?.length) {
        query = query.or(
          `id.in.(${vectorLotIds.join(",")}),search_text.wfts(swedish).${encodeURIComponent(params.query)}`,
        );
      } else {
        query = query.textSearch("search_text", params.query, {
          type: "websearch",
          config: "swedish",
        });
      }
    } else {
      query = query.textSearch("search_text", params.query, {
        type: "websearch",
        config: "swedish",
      });
    }
  }

  if (params.lotIds) {
    if (params.lotIds.length > 0) {
      query = query.in("id", params.lotIds);
    } else {
      query = query.eq("id", -1);
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

  if (params.minPrice != null) {
    query = query.gte("current_bid", params.minPrice);
  }

  if (params.maxPrice != null) {
    query = query.lte("current_bid", params.maxPrice);
  }

  return query;
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
  } else {
    query = query.lte("end_time", windowEndIso);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
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
    lotIds: searchParams
      .get("ids")
      ?.split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
    categories: searchParams.get("categories")?.split(",").filter(Boolean),
    city: searchParams.get("city") ?? undefined,
    houseId: searchParams.get("houseId") ?? undefined,
    hasBids: searchParams.get("hasBids") === "true",
    minPrice: searchParams.get("minPrice")
      ? Number(searchParams.get("minPrice"))
      : undefined,
    maxPrice: searchParams.get("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : undefined,
    sortBy:
      (searchParams.get("sort") as SortOption) ??
      getDefaultSort(status, searchParams.get("q") ?? undefined),
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
  const normalizedEffectiveQuery = effectiveQuery
    ? normalizeSearchQuery(effectiveQuery)
    : undefined;
  const effectiveParams: SearchParams = {
    ...params,
    query: normalizedEffectiveQuery || effectiveQuery || undefined,
    houseId: params.houseId ?? detectedHouseMatch?.house.id,
  };

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
      const queryEmbedding = await generateQueryEmbedding(
        effectiveParams.query!,
      );
      const { data: vectorData } = await supabase.rpc(
        "auc_semantic_search_lots",
        {
          query_embedding: JSON.stringify(queryEmbedding),
          match_threshold: 0.5,
          match_count: 200,
        },
      );
      // Already ordered by similarity (best first)
      vectorLotIds = (vectorData ?? []).map((d: any) => d.lot_id as number);
    }

    // ── Build main query ──
    let query = supabase.from("auc_lots").select(
      `
        id, title, description, categories, ai_categories, artists,
        images, thumbnail_url, currency, estimate, current_bid,
        min_bid, sold_price, start_time, end_time, local_end_time,
        created_at, city, country, availability, url, house_id,
        auc_auction_houses!inner(name, logo_url)
      `,
      { count: "exact" },
    );
    query = applySearchCriteria(query, effectiveParams, vectorLotIds, nowIso);

    // For vector/semantic mode: sort by relevance (client-side) — fetch all matches
    const useRelevanceSort = needsVector && vectorLotIds?.length;

    if (!useRelevanceSort) {
      // DB-level sorting
      switch (params.sortBy) {
        case "ending-soon":
          query = query.order("end_time", { ascending: true });
          break;
        case "recently-ended":
          query = query.order("end_time", { ascending: false });
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

    const [{ data, count, error }, windowCount, facetBundle] =
      await Promise.all([
        query,
        getWindowCount(supabase, effectiveParams, vectorLotIds, nowIso),
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
        soldPrice: row.sold_price,
        startTime: row.start_time,
        endTime: row.end_time,
        localEndTime: row.local_end_time,
        createdAt: row.created_at,
        city: row.city,
        country: row.country,
        availability: row.availability,
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
      const queryTerms = extractQueryTerms(effectiveParams.query ?? "");
      const vectorOrder = new Map(vectorLotIds!.map((id, idx) => [id, idx]));
      let rankedRows = allRows;

      if (queryTerms.length > 0) {
        const lexicalMatches = allRows
          .map((lot) => ({
            lot,
            lexicalScore: getLexicalScore(lot, queryTerms),
          }))
          .filter((entry) => entry.lexicalScore > 0)
          .sort((a, b) => {
            if (b.lexicalScore !== a.lexicalScore) {
              return b.lexicalScore - a.lexicalScore;
            }
            return (
              (vectorOrder.get(a.lot.id) ?? Number.MAX_SAFE_INTEGER) -
              (vectorOrder.get(b.lot.id) ?? Number.MAX_SAFE_INTEGER)
            );
          })
          .map((entry) => entry.lot);

        if (lexicalMatches.length > 0) {
          rankedRows = lexicalMatches;
        }
      }

      const relevanceOrder = new Map(
        rankedRows.map((lot, idx) => [lot.id, idx]),
      );
      sortLots(rankedRows, params.sortBy ?? "relevance", relevanceOrder);
      resultTotal = rankedRows.length;
      lots = rankedRows.slice(offset, offset + params.pageSize!);
    } else {
      lots = allRows;
      resultTotal = count ?? 0;
    }

    const response = NextResponse.json({
      lots,
      total: resultTotal,
      page: effectiveParams.page,
      pageSize: effectiveParams.pageSize,
      stats: {
        windowCount,
      },
      facets: {
        categories: facetBundle.categories,
        cities: facetBundle.cities,
        houses: facetBundle.houses,
      },
    });

    if (isDefaultLandingSearch(effectiveParams)) {
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300",
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
