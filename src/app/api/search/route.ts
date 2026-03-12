import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { generateQueryEmbedding } from "@/lib/embeddings";
import { FEED_SOURCES } from "@/config/sources";
import type {
  SearchParams,
  SortOption,
  SearchMode,
  SearchStatus,
} from "@/lib/types";

const PAGE_SIZE_DEFAULT = 40;
const PAGE_SIZE_MAX = 100;

/** 60 requests per minute per IP */
const RATE_LIMIT_CONFIG = { maxRequests: 60, windowMs: 60_000 };

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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/["'.,!?():;/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  if (params.categories?.length) {
    query = query.overlaps("categories", params.categories);
  }

  if (params.city) {
    query = query.eq("city", params.city);
  }

  if (params.houseId) {
    query = query.eq("house_id", params.houseId);
  }

  if (params.minPrice != null) {
    query = query.gte("current_bid", params.minPrice);
  }

  if (params.maxPrice != null) {
    query = query.lte("current_bid", params.maxPrice);
  }

  return query;
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
    searchMode: (searchParams.get("mode") as SearchMode) ?? "keyword",
    status,
    categories: searchParams.get("categories")?.split(",").filter(Boolean),
    city: searchParams.get("city") ?? undefined,
    houseId: searchParams.get("houseId") ?? undefined,
    minPrice: searchParams.get("minPrice")
      ? Number(searchParams.get("minPrice"))
      : undefined,
    maxPrice: searchParams.get("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : undefined,
    sortBy: (searchParams.get("sort") as SortOption) ?? "ending-soon",
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
  const effectiveParams: SearchParams = {
    ...params,
    query: effectiveQuery || undefined,
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

    let statsQuery = supabase.from("auc_lots").select("end_time, availability");
    statsQuery = applySearchCriteria(
      statsQuery,
      effectiveParams,
      vectorLotIds,
      nowIso,
    );

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

    const [{ data, count, error }, { data: statsRows, error: statsError }] =
      await Promise.all([query, statsQuery]);

    if (error) {
      console.error("[api/search] Query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (statsError) {
      console.error("[api/search] Stats query error:", statsError);
    }

    // Fetch facets (category, city & house counts) in parallel
    const [categoryFacets, cityFacets, houseFacets] = await Promise.all([
      getCategoryFacets(supabase, params.status ?? "active"),
      getCityFacets(supabase, params.status ?? "active"),
      getHouseFacets(supabase, params.status ?? "active"),
    ]);

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
        houseName: row.auc_auction_houses?.name,
        houseLogoUrl: row.auc_auction_houses?.logo_url ?? undefined,
        isActive: isLotActive(row),
      }),
    );

    // For vector mode: sort by semantic relevance, paginate client-side
    let lots, resultTotal;
    if (useRelevanceSort) {
      const idOrder = new Map(vectorLotIds!.map((id, idx) => [id, idx]));
      sortLots(allRows, params.sortBy ?? "ending-soon", idOrder);
      resultTotal = allRows.length;
      lots = allRows.slice(offset, offset + params.pageSize!);
    } else {
      lots = allRows;
      resultTotal = count ?? 0;
    }

    return NextResponse.json({
      lots,
      total: resultTotal,
      page: effectiveParams.page,
      pageSize: effectiveParams.pageSize,
      stats: {
        windowCount: getStatusWindowCountFromRows(
          (statsRows ?? []) as Array<
            Pick<SearchRow, "end_time" | "availability">
          >,
          effectiveParams.status ?? "active",
        ),
      },
      facets: {
        categories: categoryFacets,
        cities: cityFacets,
        houses: houseFacets,
      },
    });
  } catch (error) {
    console.error("[api/search] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function getCategoryFacets(supabase: any, status: SearchStatus) {
  let query = supabase.from("auc_lots").select("categories");
  query = applyStatusFilter(query, status, new Date().toISOString());

  const { data } = await query;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    for (const category of row.categories ?? []) {
      counts[category] = (counts[category] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

async function getCityFacets(supabase: any, status: SearchStatus) {
  let query = supabase.from("auc_lots").select("city").not("city", "is", null);
  query = applyStatusFilter(query, status, new Date().toISOString());

  const { data } = await query;

  // Count manually since Supabase doesn't support GROUP BY easily
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.city] = (counts[row.city] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

async function getHouseFacets(supabase: any, status: SearchStatus) {
  let query = supabase
    .from("auc_lots")
    .select("house_id, auc_auction_houses(name)")
    .not("house_id", "is", null);

  query = applyStatusFilter(query, status, new Date().toISOString());

  const { data } = await query;

  const counts: Record<string, { name: string; count: number }> = {};
  for (const row of data ?? []) {
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
