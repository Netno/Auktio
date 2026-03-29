import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { generateQueryEmbedding } from "@/lib/embeddings";
import {
  buildSwedishWordRoots as buildWordRoots,
  expandSwedishSemanticQueryTerms as expandSemanticTerms,
  extractSwedishQueryTerms as extractQueryTerms,
  normalizeSearchText as normalizeText,
  normalizeSwedishSearchQuery as normalizeSearchQuery,
} from "@/lib/search-language";
import {
  buildQueryScoringTerms,
  buildQueryTextMatchClauses,
} from "@/lib/search-text-match";
import {
  detectPrimaryObjectIntent,
  detectQueryModifierTerms,
  evaluateCollectionMatch,
  evaluateModifierMatch,
  evaluateObjectMatch as evaluateLotObjectMatch,
  getBaseQueryTermWeight as getBaseTermWeight,
  getCollectionAwareScorePenalty,
  getModifierAwareScoreBoost,
  shouldRequirePrimaryObjectMatch,
  shouldRequireModifierMatch,
  type DetectedObjectIntent,
} from "@/lib/search-object-intent";
import { detectCategoryIntent } from "@/lib/search-category-intent";
import { getDidYouMeanQuery } from "@/lib/search-spelling";
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

const STRONG_ANIMAL_EXPANSION_TERMS = new Set([
  "leopard",
  "lejon",
  "tiger",
  "panter",
  "jaguar",
  "lodjur",
]);

const WEAK_ANIMAL_EXPANSION_TERMS = new Set([
  "animal",
  "fauna",
  "djur",
  "djurmotiv",
  "hund",
  "katt",
  "häst",
  "fågel",
  "fisk",
]);

const DECORATIVE_OBJECT_TERMS = new Set([
  "porslin",
  "keramik",
  "fat",
  "fiskfat",
  "tallrik",
  "skal",
  "skål",
  "vas",
  "urna",
  "servis",
]);

const PAINTING_QUERY_TERMS = new Set([
  "målning",
  "måleri",
  "olja",
  "oljemålning",
  "akvarell",
  "gouache",
  "pastell",
  "tempera",
  "tavla",
]);

const PAINTING_RESULT_TERMS = new Set([
  "målning",
  "måleri",
  "olja",
  "oljemålning",
  "akvarell",
  "gouache",
  "pastell",
  "tempera",
  "tavla",
  "konst",
]);

function getLexicalScore(
  lot: NormalizedLot,
  queryTerms: string[],
  termWeight: (term: string) => number = () => 1,
) {
  if (!queryTerms.length) {
    return 0;
  }
  const normalizedTitle = normalizeText(lot.title ?? "");
  const titleTokens = normalizedTitle
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));
  const categoryTokens = normalizeText((lot.categories ?? []).join(" "))
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));
  const aiCategoryTokens = normalizeText((lot.aiCategories ?? []).join(" "))
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));
  const artistTokens = normalizeText((lot.artists ?? []).join(" "))
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
    const weight = termWeight(term);

    if (matchesTerm(titleTokens, term)) {
      score += 6 * weight;
      if (normalizedTitle.includes(term)) {
        score += 2 * weight;
      }
    } else if (matchesTerm(artistTokens, term)) {
      score += 4 * weight;
    } else if (matchesTerm(categoryTokens, term)) {
      score += 3 * weight;
    } else if (matchesTerm(aiCategoryTokens, term)) {
      score += 4 * weight;
    } else if (matchesTerm(descriptionTokens, term)) {
      score += 1 * weight;
    }
  }

  return score;
}

function hasAnyNormalizedTerm(value: string, terms: Set<string>) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return false;

  return Array.from(terms).some((term) => normalizedValue.includes(term));
}

function getExpandedTermWeight(term: string) {
  if (STRONG_ANIMAL_EXPANSION_TERMS.has(term)) return 1.35;
  if (WEAK_ANIMAL_EXPANSION_TERMS.has(term)) return 0.6;
  return 0.9;
}

function isConcreteObjectQuery(query: string) {
  const normalized = normalizeSearchQuery(query);
  const words = normalized.split(" ").filter(Boolean);
  return words.length > 0 && words.length <= 3;
}

function getVectorRankScore(vectorOrder: Map<number, number>, lotId: number) {
  const position = vectorOrder.get(lotId);
  if (position == null) return 0;
  return 1 / (position + 1);
}

function getBlendedSearchScore(
  lot: NormalizedLot,
  queryTerms: string[],
  expandedQueryTerms: string[],
  normalizedQuery: string,
  vectorOrder: Map<number, number>,
  concreteQuery: boolean,
  primaryObjectIntent: DetectedObjectIntent | null,
  queryModifierTerms: string[],
) {
  const lexicalScore = getLexicalScore(lot, queryTerms, getBaseTermWeight);
  const expandedLexicalScore = getLexicalScore(
    lot,
    expandedQueryTerms,
    getExpandedTermWeight,
  );
  const vectorScore = getVectorRankScore(vectorOrder, lot.id);
  const normalizedTitle = normalizeText(lot.title ?? "");
  const normalizedCategories = normalizeText((lot.categories ?? []).join(" "));
  const normalizedAiCategories = normalizeText(
    (lot.aiCategories ?? []).join(" "),
  );
  const normalizedDescription = normalizeText(lot.description ?? "");
  const combinedSearchText = [
    normalizedTitle,
    normalizedCategories,
    normalizedAiCategories,
    normalizedDescription,
  ]
    .filter(Boolean)
    .join(" ");
  const hasExactPhrase =
    normalizedQuery.length >= 3 &&
    (normalizedTitle.includes(normalizedQuery) ||
      normalizedCategories.includes(normalizedQuery) ||
      normalizedAiCategories.includes(normalizedQuery));
  const strongAnimalMatch = hasAnyNormalizedTerm(
    combinedSearchText,
    STRONG_ANIMAL_EXPANSION_TERMS,
  );
  const weakAnimalMatch = hasAnyNormalizedTerm(
    combinedSearchText,
    WEAK_ANIMAL_EXPANSION_TERMS,
  );
  const decorativeObjectMatch = hasAnyNormalizedTerm(
    combinedSearchText,
    DECORATIVE_OBJECT_TERMS,
  );
  const queryHasPaintingIntent = queryTerms.some((term) =>
    PAINTING_QUERY_TERMS.has(term),
  );
  const lotHasPaintingSignal = hasAnyNormalizedTerm(
    combinedSearchText,
    PAINTING_RESULT_TERMS,
  );
  const objectMatch = evaluateLotObjectMatch(lot, primaryObjectIntent);
  const modifierMatch = evaluateModifierMatch(lot, queryModifierTerms);
  const collectionMatch = evaluateCollectionMatch(lot);

  let score =
    lexicalScore * (concreteQuery ? 1.8 : 1.2) +
    expandedLexicalScore * (concreteQuery ? 1.15 : 0.75) +
    vectorScore * 3;

  if (primaryObjectIntent) {
    if (objectMatch.hasStrongMatch) {
      score += 18 + objectMatch.score * 0.5;
    } else if (objectMatch.hasMatch) {
      score += 9 + objectMatch.score * 0.35;
    } else {
      score -= concreteQuery ? 24 : 10;
    }
  }

  score += getModifierAwareScoreBoost(
    modifierMatch,
    queryModifierTerms,
    concreteQuery,
  );
  score += getCollectionAwareScorePenalty(
    collectionMatch,
    concreteQuery,
    Boolean(primaryObjectIntent) || queryModifierTerms.length > 0,
  );

  if (lexicalScore === 0 && expandedLexicalScore > 0) {
    if (strongAnimalMatch) {
      score += 3;
    } else if (weakAnimalMatch) {
      score += 0.5;
    }

    if (decorativeObjectMatch && !strongAnimalMatch) {
      score -= 2.25;
    }
  }

  if (hasExactPhrase) {
    score += concreteQuery ? 14 : 8;
  }

  if (queryHasPaintingIntent) {
    if (lotHasPaintingSignal) {
      score += 4;
    } else if (decorativeObjectMatch) {
      score -= 3.5;
    }
  }

  if (
    queryTerms.includes("djurmotiv") &&
    normalizedAiCategories.includes("djurmotiv")
  ) {
    score += 6;
  }

  return {
    score,
    lexicalScore,
    expandedLexicalScore,
    hasExactPhrase,
    hasObjectMatch: objectMatch.hasMatch,
    hasStrongObjectMatch: objectMatch.hasStrongMatch,
    hasModifierMatch: modifierMatch.hasMatch,
    hasCollectionMatch: collectionMatch.hasMatch,
  };
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
      case "recently-sold": {
        const aIsSold = a.availability === "sold";
        const bIsSold = b.availability === "sold";

        if (aIsSold !== bIsSold) {
          return aIsSold ? -1 : 1;
        }

        return compareDates(a.endTime, b.endTime, "desc");
      }
      case "newly-listed":
        return compareDates(a.createdAt, b.createdAt, "desc");
      case "price-asc":
        return compareNumbers(a.currentBid, b.currentBid, "asc");
      case "price-desc":
        return compareNumbers(a.currentBid, b.currentBid, "desc");
      case "sold-price-desc":
        return compareNumbers(
          a.currentBid ?? a.soldPrice,
          b.currentBid ?? b.soldPrice,
          "desc",
        );
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

function isLotActive(row: Pick<SearchRow, "availability" | "end_time">) {
  if (row.availability != null) return false;
  if (!row.end_time) return true;
  return new Date(row.end_time).getTime() > Date.now();
}

function getDefaultSort(status: SearchStatus, query?: string): SortOption {
  if (query?.trim()) return "relevance";
  return status === "ended" ? "recently-ended" : "ending-soon";
}

function buildExpandedSemanticQuery(query: string) {
  const normalizedQuery = normalizeSearchQuery(query);
  const expandedTerms = expandSemanticTerms(query);

  return Array.from(
    new Set(
      [normalizedQuery, ...expandedTerms]
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

function shouldRequireStrictLexicalMatch(
  query: string,
  lexicalQualifiedCount: number,
) {
  return isConcreteObjectQuery(query) && lexicalQualifiedCount >= 8;
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

  return Array.from(
    new Set(
      [normalizedQuery, ...expandedTerms]
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
  query = applyStatusFilter(query, params.status ?? "active", nowIso);

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
      [normalizeSearchQuery(params.query), ...expandSemanticTerms(params.query)]
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
      const amount = isLotActive(row) ? row.current_bid : row.sold_price;

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
  const detectedCategory = detectCategoryIntent(effectiveQuery);
  const shouldTreatAsCategoryBrowse = Boolean(
    detectedCategory && effectiveQuery && normalizeSearchQuery(effectiveQuery),
  );
  const normalizedEffectiveQuery = effectiveQuery
    ? normalizeSearchQuery(effectiveQuery)
    : undefined;
  const effectiveParams: SearchParams = {
    ...params,
    query: shouldTreatAsCategoryBrowse
      ? undefined
      : normalizedEffectiveQuery || effectiveQuery || undefined,
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
      const { queryTerms, expandedQueryTerms } = buildQueryScoringTerms(
        effectiveParams.query ?? "",
      );
      const vectorOrder = new Map(vectorLotIds!.map((id, idx) => [id, idx]));
      const normalizedQuery = normalizeSearchQuery(effectiveParams.query ?? "");
      const concreteQuery = isConcreteObjectQuery(effectiveParams.query ?? "");
      const primaryObjectIntent = detectPrimaryObjectIntent(
        effectiveParams.query ?? "",
      );
      const queryModifierTerms = detectQueryModifierTerms(
        effectiveParams.query ?? "",
        primaryObjectIntent,
      );

      const rankedEntries = allRows
        .map((lot) => {
          const blended = getBlendedSearchScore(
            lot,
            queryTerms,
            expandedQueryTerms,
            normalizedQuery,
            vectorOrder,
            concreteQuery,
            primaryObjectIntent,
            queryModifierTerms,
          );
          return { lot, ...blended };
        })
        .filter(
          (entry) =>
            !concreteQuery ||
            entry.lexicalScore > 0 ||
            entry.expandedLexicalScore > 0 ||
            entry.hasExactPhrase ||
            entry.hasObjectMatch,
        )
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return (
            (vectorOrder.get(a.lot.id) ?? Number.MAX_SAFE_INTEGER) -
            (vectorOrder.get(b.lot.id) ?? Number.MAX_SAFE_INTEGER)
          );
        });

      const objectQualifiedRows = primaryObjectIntent
        ? rankedEntries.filter((entry) => entry.hasObjectMatch)
        : rankedEntries;

      const rowsAfterObjectFilter = shouldRequirePrimaryObjectMatch(
        effectiveParams.query ?? "",
        primaryObjectIntent,
        objectQualifiedRows.length,
      )
        ? objectQualifiedRows
        : rankedEntries;

      const lexicalQualifiedRows = rowsAfterObjectFilter.filter(
        (entry) =>
          entry.lexicalScore > 0 ||
          entry.expandedLexicalScore > 0 ||
          entry.hasExactPhrase ||
          entry.hasObjectMatch,
      );

      const modifierQualifiedRows = queryModifierTerms.length
        ? lexicalQualifiedRows.filter((entry) => entry.hasModifierMatch)
        : lexicalQualifiedRows;

      const rowsAfterModifierFilter = shouldRequireModifierMatch(
        effectiveParams.query ?? "",
        queryModifierTerms,
        modifierQualifiedRows.length,
      )
        ? modifierQualifiedRows
        : lexicalQualifiedRows;

      const nonCollectionRows = rowsAfterModifierFilter.filter(
        (entry) => !entry.hasCollectionMatch,
      );
      const rowsAfterCollectionFilter =
        concreteQuery &&
        (primaryObjectIntent || queryModifierTerms.length > 0) &&
        nonCollectionRows.length >= 4
          ? nonCollectionRows
          : rowsAfterModifierFilter;

      const finalRankedRows = shouldRequireStrictLexicalMatch(
        effectiveParams.query ?? "",
        rowsAfterCollectionFilter.length,
      )
        ? rowsAfterCollectionFilter.map((entry) => entry.lot)
        : rowsAfterCollectionFilter.map((entry) => entry.lot);

      const relevanceOrder = new Map(
        finalRankedRows.map((lot, idx) => [lot.id, idx]),
      );
      sortLots(finalRankedRows, params.sortBy ?? "relevance", relevanceOrder);
      resultTotal = finalRankedRows.length;
      lots = finalRankedRows.slice(offset, offset + params.pageSize!);
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
