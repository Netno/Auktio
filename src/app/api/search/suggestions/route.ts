import { NextRequest, NextResponse } from "next/server";
import { CATEGORY_ORDER, FEED_SOURCES } from "@/config/sources";
import { getClientIP, rateLimit } from "@/lib/rate-limit";
import {
  buildSwedishWordRoots,
  expandSwedishSemanticQueryTerms,
  extractSwedishQueryTerms,
  normalizeSearchText,
  normalizeSwedishSearchQuery,
} from "@/lib/search-language";
import {
  detectPrimaryObjectIntent,
  detectQueryModifierTerms,
  evaluateCollectionMatch,
  evaluateModifierMatch,
  evaluateObjectMatch,
  getCollectionAwareScorePenalty,
  getModifierAwareScoreBoost,
  shouldRequirePrimaryObjectMatch,
} from "@/lib/search-object-intent";
import { createServerClient } from "@/lib/supabase";
import type {
  SearchStatus,
  SearchSuggestion,
  SearchSuggestionsResponse,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RATE_LIMIT_CONFIG = { maxRequests: 120, windowMs: 60_000 };
const MAX_STATIC_SUGGESTIONS = 2;
const MAX_LOT_SUGGESTIONS = 4;
const LOT_SUGGESTION_CANDIDATE_LIMIT = 24;
const MAX_TOTAL_SUGGESTIONS = 7;

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
]);

type LotSuggestionRow = {
  id: number;
  title: string | null;
  description: string | null;
  categories: string[] | null;
  ai_categories: string[] | null;
  artists: string[] | null;
  house_id: string | null;
  end_time?: string | null;
  auc_auction_houses?: {
    name?: string | null;
  } | null;
};

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

function buildQueryTerms(query: string) {
  const normalizedQuery = normalizeSwedishSearchQuery(query);
  const normalizedText = normalizeSearchText(query);
  const baseTerms = extractSwedishQueryTerms(query);
  const expandedTerms = expandSwedishSemanticQueryTerms(query).filter(
    (term) => !baseTerms.includes(term) && term.length >= 3,
  );
  const tokens = Array.from(
    new Set(
      [normalizedQuery, normalizedText]
        .flatMap((value) => value.split(" "))
        .map((value) => value.trim())
        .filter((value) => value.length >= 2)
        .flatMap((value) => [value, ...buildSwedishWordRoots(value)]),
    ),
  );

  return {
    normalizedQuery: normalizedQuery || normalizedText,
    baseTerms,
    expandedTerms,
    tokens,
  };
}

function getLexicalFieldScore(value: string, terms: string[], weight: number) {
  const normalizedValue = normalizeSearchText(value);

  if (!normalizedValue || terms.length === 0) {
    return 0;
  }

  const tokens = normalizedValue
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildSwedishWordRoots(token));

  let score = 0;

  for (const term of terms) {
    if (
      tokens.some((token) => token === term || token.endsWith(term)) ||
      normalizedValue.includes(term)
    ) {
      score += weight;
      if (normalizedValue.includes(term)) {
        score += weight * 0.25;
      }
    }
  }

  return score;
}

function hasAnyNormalizedTerm(value: string, terms: Set<string>) {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return false;

  return Array.from(terms).some((term) => normalizedValue.includes(term));
}

function buildExpandedTextMatchClauses(query: string) {
  const { normalizedQuery, baseTerms, expandedTerms } = buildQueryTerms(query);
  const searchableTerms = Array.from(
    new Set([normalizedQuery, ...baseTerms, ...expandedTerms].filter(Boolean)),
  ).slice(0, 16);

  return searchableTerms.flatMap((term) => [
    `title.ilike.%${term}%`,
    `description.ilike.%${term}%`,
  ]);
}

function getMatchScore(
  value: string,
  normalizedQuery: string,
  tokens: string[],
) {
  const normalizedValue = normalizeSearchText(value);

  if (!normalizedValue) {
    return -1;
  }

  if (normalizedValue === normalizedQuery) {
    return 400;
  }

  if (normalizedValue.startsWith(normalizedQuery)) {
    return 300;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return 200;
  }

  const tokenMatches = tokens.filter((token) =>
    normalizedValue.includes(token),
  );

  if (tokenMatches.length === 0) {
    return -1;
  }

  return tokenMatches.length * 40 - normalizedValue.length * 0.1;
}

function buildHouseSuggestions(query: string) {
  const { normalizedQuery, tokens } = buildQueryTerms(query);

  return FEED_SOURCES.map((source) => ({
    source,
    score: getMatchScore(
      `${source.name} ${source.id.replace(/-/g, " ")}`,
      normalizedQuery,
      tokens,
    ),
  }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_STATIC_SUGGESTIONS)
    .map<SearchSuggestion>(({ source }) => ({
      id: `house:${source.id}`,
      type: "house",
      label: source.name,
      query: source.name,
      subtitle: "Auktionshus",
    }));
}

function buildCategorySuggestions(query: string) {
  const { normalizedQuery, tokens } = buildQueryTerms(query);

  return CATEGORY_ORDER.map((category) => ({
    category,
    score: getMatchScore(category, normalizedQuery, tokens),
  }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_STATIC_SUGGESTIONS)
    .map<SearchSuggestion>(({ category }) => ({
      id: `category:${category}`,
      type: "category",
      label: category,
      query: category,
      subtitle: "Kategori",
    }));
}

function scoreLotSuggestion(row: LotSuggestionRow, rawQuery: string) {
  const { normalizedQuery, baseTerms, expandedTerms } =
    buildQueryTerms(rawQuery);
  const objectIntent = detectPrimaryObjectIntent(rawQuery);
  const queryModifierTerms = detectQueryModifierTerms(rawQuery, objectIntent);
  const title = row.title ?? "";
  const description = row.description ?? "";
  const categories = row.categories ?? [];
  const aiCategories = row.ai_categories ?? [];
  const artists = row.artists ?? [];

  const lexicalScore =
    getLexicalFieldScore(title, baseTerms, 7) +
    getLexicalFieldScore(artists.join(" "), baseTerms, 5) +
    getLexicalFieldScore(categories.join(" "), baseTerms, 4) +
    getLexicalFieldScore(aiCategories.join(" "), baseTerms, 5) +
    getLexicalFieldScore(description, baseTerms, 2);

  const expandedScore =
    getLexicalFieldScore(title, expandedTerms, 3.2) +
    getLexicalFieldScore(artists.join(" "), expandedTerms, 2.5) +
    getLexicalFieldScore(categories.join(" "), expandedTerms, 2.3) +
    getLexicalFieldScore(aiCategories.join(" "), expandedTerms, 3.1) +
    getLexicalFieldScore(description, expandedTerms, 1.8);

  const combinedText = normalizeSearchText(
    [
      title,
      categories.join(" "),
      aiCategories.join(" "),
      artists.join(" "),
      description,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const hasStrongAnimalSignal = hasAnyNormalizedTerm(
    combinedText,
    STRONG_ANIMAL_EXPANSION_TERMS,
  );
  const hasWeakAnimalSignal = hasAnyNormalizedTerm(
    combinedText,
    WEAK_ANIMAL_EXPANSION_TERMS,
  );
  const hasAnimalSignal = hasStrongAnimalSignal || hasWeakAnimalSignal;
  const hasPaintingSignal = hasAnyNormalizedTerm(
    combinedText,
    PAINTING_RESULT_TERMS,
  );
  const queryHasAnimalIntent =
    baseTerms.some(
      (term) =>
        STRONG_ANIMAL_EXPANSION_TERMS.has(term) ||
        WEAK_ANIMAL_EXPANSION_TERMS.has(term),
    ) ||
    expandedTerms.some(
      (term) =>
        STRONG_ANIMAL_EXPANSION_TERMS.has(term) ||
        WEAK_ANIMAL_EXPANSION_TERMS.has(term),
    );
  const queryHasPaintingIntent = baseTerms.some((term) =>
    PAINTING_QUERY_TERMS.has(term),
  );
  const requiresObjectMatch = shouldRequirePrimaryObjectMatch(
    rawQuery,
    objectIntent,
    objectIntent ? 1 : 0,
  );
  const hasExactPhrase =
    normalizedQuery.length >= 3 && combinedText.includes(normalizedQuery);
  const objectMatch = evaluateObjectMatch(
    {
      title,
      categories,
      aiCategories,
      description,
    },
    objectIntent,
  );
  const modifierMatch = evaluateModifierMatch(
    {
      title,
      categories,
      aiCategories,
      description,
    },
    queryModifierTerms,
  );
  const collectionMatch = evaluateCollectionMatch({
    title,
    categories,
    aiCategories,
    description,
  });

  let score = lexicalScore * 1.8 + expandedScore;

  if (hasExactPhrase) {
    score += 12;
  }

  if (objectMatch.hasStrongMatch) {
    score += 12 + objectMatch.score * 0.45;
  } else if (objectMatch.hasMatch) {
    score += 5 + objectMatch.score * 0.25;
  }

  score += getModifierAwareScoreBoost(modifierMatch, queryModifierTerms, false);
  score += getCollectionAwareScorePenalty(
    collectionMatch,
    false,
    Boolean(objectIntent) || queryModifierTerms.length > 0,
  );

  if (queryHasAnimalIntent && !hasAnimalSignal) {
    score -= 40;
  }

  if (queryHasPaintingIntent && !hasPaintingSignal) {
    score -= 28;
  }

  return {
    score,
    queryHasAnimalIntent,
    queryHasPaintingIntent,
    hasAnimalSignal,
    hasPaintingSignal,
    requiresObjectMatch,
    hasObjectMatch: objectMatch.hasMatch,
  };
}

async function getLotSuggestions(request: NextRequest, status: SearchStatus) {
  const searchParams = request.nextUrl.searchParams;
  const rawQuery = searchParams.get("q")?.trim() ?? "";

  if (rawQuery.length < 2) {
    return [] as SearchSuggestion[];
  }

  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const normalizedQuery = normalizeSwedishSearchQuery(rawQuery) || rawQuery;
  const expandedClauses = buildExpandedTextMatchClauses(rawQuery);

  let query = supabase
    .from("auc_lots")
    .select(
      `id, title, description, categories, ai_categories, artists, house_id, end_time, auc_auction_houses(name)`,
    )
    .limit(LOT_SUGGESTION_CANDIDATE_LIMIT);

  query = applyStatusFilter(query, status, nowIso);

  const categories =
    searchParams.get("categories")?.split(",").filter(Boolean) ?? [];
  const city = searchParams.get("city") ?? "";
  const houseId = searchParams.get("houseId") ?? "";

  if (categories.length > 0) {
    query = query.overlaps("categories", categories);
  }

  if (city) {
    query = query.eq("city", city);
  }

  if (houseId) {
    query = query.eq("house_id", houseId);
  }

  if (expandedClauses.length > 0) {
    query = query.or(expandedClauses.join(","));
  } else {
    query = query.textSearch("search_text", normalizedQuery, {
      type: "websearch",
      config: "swedish",
    });
  }

  query = query.order("end_time", { ascending: status !== "ended" });

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const seenLabels = new Set<string>();

  return ((data ?? []) as LotSuggestionRow[])
    .filter((row) => Boolean(row.title))
    .map((row) => ({ row, ranking: scoreLotSuggestion(row, rawQuery) }))
    .filter(({ ranking }) => ranking.score > 0)
    .filter(({ ranking }) => {
      if (ranking.queryHasAnimalIntent && !ranking.hasAnimalSignal) {
        return false;
      }

      if (ranking.queryHasPaintingIntent && !ranking.hasPaintingSignal) {
        return false;
      }

      if (ranking.requiresObjectMatch && !ranking.hasObjectMatch) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.ranking.score - left.ranking.score)
    .filter((row) => {
      const key = normalizeSearchText(row.row.title ?? "");
      if (!key || seenLabels.has(key)) {
        return false;
      }

      seenLabels.add(key);
      return true;
    })
    .slice(0, MAX_LOT_SUGGESTIONS)
    .map<SearchSuggestion>(({ row }) => ({
      id: `lot:${row.id}`,
      type: "lot",
      label: row.title ?? "",
      query: row.title ?? "",
      subtitle: row.auc_auction_houses?.name
        ? `Föremål hos ${row.auc_auction_houses.name}`
        : "Föremål",
    }));
}

export async function GET(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = rateLimit(`search-suggestions:${ip}`, RATE_LIMIT_CONFIG);

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      },
    );
  }

  try {
    const rawQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const statusParam = request.nextUrl.searchParams.get("status");
    const status: SearchStatus =
      statusParam === "ended" ||
      statusParam === "all" ||
      statusParam === "active"
        ? statusParam
        : "active";

    if (rawQuery.length < 2) {
      const emptyResponse: SearchSuggestionsResponse = { suggestions: [] };
      return NextResponse.json(emptyResponse, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const [lotSuggestions, houseSuggestions, categorySuggestions] =
      await Promise.all([
        getLotSuggestions(request, status),
        Promise.resolve(buildHouseSuggestions(rawQuery)),
        Promise.resolve(buildCategorySuggestions(rawQuery)),
      ]);

    const suggestions = Array.from(
      new Map(
        [...lotSuggestions, ...houseSuggestions, ...categorySuggestions].map(
          (suggestion) => [
            `${suggestion.type}:${normalizeSearchText(suggestion.label)}`,
            suggestion,
          ],
        ),
      ).values(),
    ).slice(0, MAX_TOTAL_SUGGESTIONS);

    const response: SearchSuggestionsResponse = {
      suggestions,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("[api/search/suggestions] Error:", error);
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}
