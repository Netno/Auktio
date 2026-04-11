/**
 * RAG (Retrieval-Augmented Generation) pipeline for Auktio.
 *
 * Flow:
 * 1. User asks a natural language question
 * 2. Generate query embedding via Gemini
 * 3. Retrieve top-K similar lots from pgvector
 * 4. (Optional) Hybrid: also run full-text search and merge results
 * 5. Build context from retrieved lots
 * 6. Send context + question to Gemini for answer generation
 * 7. Return structured response with answer + source lots
 */

import { createServerClient } from "./supabase";
import { extractGeminiUsageMetadata, logAiUsage } from "./ai-usage-log";
import { generateQueryEmbedding } from "./embeddings";
import { formatDate, formatSEK } from "./utils";
import {
  buildSwedishWordRoots as buildWordRoots,
  expandSwedishSemanticQueryTerms as expandSemanticTerms,
  extractSwedishQueryTerms as extractQueryTerms,
  normalizeSearchText as normalizeText,
  normalizeSwedishSearchQuery as normalizeSearchQuery,
} from "@/lib/search-language";
import {
  isBroadBrowseQuery,
  resolveSearchIntent,
  type DetectedAuctionHouseIntent,
  type SearchIntent,
} from "@/lib/search-intent";
import {
  buildQueryScoringTerms,
  buildQueryTextMatchClauses,
} from "@/lib/search-text-match";
import {
  getQueryUnderstandingSemanticPhrases,
  getQueryUnderstandingTerms,
} from "@/lib/search-query-understanding";
import { rankLotsByRelevance } from "@/lib/search-relevance";
import {
  detectPrimaryObjectIntent,
  detectQueryModifierTerms,
  evaluateCollectionMatch,
  evaluateModifierMatch,
  evaluateObjectMatch as evaluateLotObjectMatch,
  getBaseQueryTermWeight as getBaseTermWeight,
  getCollectionAwareScorePenalty,
  getModifierAwareScoreBoost,
  getObjectAwareScoreBoost,
  shouldRequirePrimaryObjectMatch,
  shouldRequireModifierMatch,
} from "@/lib/search-object-intent";
import { detectCategoryIntent } from "@/lib/search-category-intent";

const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

/** Maximum lots to retrieve for context */
const TOP_K_VECTOR = 15;
const TOP_K_FULLTEXT = 10;

/** Maximum lots to include in the final LLM context (after dedup + re-rank) */
const MAX_CONTEXT_LOTS = 12;

export interface RAGRequest {
  query: string;
  /** Optional filters to narrow retrieval */
  categories?: string[];
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Whether to include ended lots */
  includeEnded?: boolean;
}

export interface RAGResponse {
  answer: string;
  sources: RAGSourceLot[];
  retrievalStats: {
    vectorMatches: number;
    fulltextMatches: number;
    totalContextLots: number;
    queryTimeMs: number;
  };
}

export interface RAGSourceLot {
  id: number;
  title: string;
  description?: string;
  categories: string[];
  aiCategories?: string[];
  currentBid?: number;
  estimate?: number;
  currency: string;
  city?: string;
  houseName?: string;
  url: string;
  thumbnailUrl?: string;
  endTime?: string;
  similarity?: number;
}

type DetectedAuctionHouse = DetectedAuctionHouseIntent;
type DerivedRetrievalIntent = SearchIntent;

function buildNoContextAnswer(
  userQuery: string,
  detectedAuctionHouse: DetectedAuctionHouse | null,
) {
  const houseText = detectedAuctionHouse
    ? ` hos ${detectedAuctionHouse.name}`
    : "";

  return `Jag hittade inga tydligt relevanta föremål${houseText} för frågan "${userQuery}" just nu. Prova att smalna av sökningen med föremålstyp, kategori, prisnivå eller tidsfönster, till exempel "mynt under 500 kr", "sedlar som slutar snart" eller "silver hos ${detectedAuctionHouse?.name ?? "ett visst auktionshus"}".`;
}

function normalizeAnswerBullets(answer: string): string {
  return answer.replace(/^\s*-\s+/gm, "• ");
}

function extractSignificantWords(query: string): string[] {
  return normalizeSearchQuery(query)
    .split(" ")
    .filter((word) => word.length >= 3);
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
  if (termCount <= 2) return 0.72;
  if (termCount === 3) return 0.66;
  return 0.58;
}

function isConcreteObjectQuery(query: string) {
  const normalized = normalizeSearchQuery(query);
  const words = normalized.split(" ").filter(Boolean);
  return words.length > 0 && words.length <= 3;
}

function getLexicalMatch(lot: RAGSourceLot, queryTerms: string[]) {
  if (!queryTerms.length) {
    return { score: 0, strong: false };
  }

  const titleTokens = normalizeText(lot.title ?? "")
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
  const descriptionTokens = normalizeText(lot.description ?? "")
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));

  const matchesTerm = (tokens: string[], term: string) =>
    tokens.some((token) => token === term || token.endsWith(term));

  let score = 0;
  let strong = false;

  for (const term of queryTerms) {
    const weight = getBaseTermWeight(term);
    const inTitle = matchesTerm(titleTokens, term);
    const inCategory = matchesTerm(categoryTokens, term);
    const inDescription = matchesTerm(descriptionTokens, term);

    if (inTitle) {
      score += 4 * weight;
      strong = true;
    } else if (matchesTerm(aiCategoryTokens, term)) {
      score += 3 * weight;
      strong = true;
    } else if (inCategory) {
      score += 2 * weight;
    } else if (inDescription) {
      score += 1 * weight;
    }
  }

  return { score, strong };
}

/**
 * Execute the full RAG pipeline.
 */
export async function executeRAG(request: RAGRequest): Promise<RAGResponse> {
  const startTime = Date.now();
  const supabase = createServerClient();
  const derivedIntent = await resolveSearchIntent(request.query, {
    includeEnded: request.includeEnded,
  });
  const detectedCategory = detectCategoryIntent(derivedIntent.retrievalQuery);
  const shouldTreatAsCategoryBrowse = Boolean(detectedCategory);
  const effectiveRequest =
    request.categories?.length || !detectedCategory
      ? request
      : {
          ...request,
          query: shouldTreatAsCategoryBrowse ? "" : request.query,
          categories: [detectedCategory],
        };
  const detectedAuctionHouse = derivedIntent.matchedAuctionHouse;
  const rankingQuery = derivedIntent.retrievalQuery;
  const semanticSeedQuery =
    rankingQuery || derivedIntent.queryWithoutHouse || request.query;
  const retrievalQuery = semanticSeedQuery;
  const finalRequest =
    effectiveRequest.categories?.length ||
    retrievalQuery === effectiveRequest.query
      ? effectiveRequest
      : {
          ...effectiveRequest,
          query: retrievalQuery,
        };
  const shouldUseSemanticRetrieval = Boolean(finalRequest.query?.trim());

  let vectorResults: RAGSourceLot[] = [];
  let fulltextResults: RAGSourceLot[] = [];
  let mergedLots: RAGSourceLot[] = [];

  if (
    shouldUseSemanticRetrieval &&
    (!derivedIntent.prefersBrowse || rankingQuery)
  ) {
    const expandedSemanticQuery = buildExpandedSemanticQuery(semanticSeedQuery);

    // ─── Step 1: Generate query embedding ───
    const queryEmbedding = await generateQueryEmbedding(
      expandedSemanticQuery || semanticSeedQuery,
    );

    // ─── Step 2: Hybrid retrieval (vector + fulltext in parallel) ───
    [vectorResults, fulltextResults] = await Promise.all([
      retrieveByVector(
        supabase,
        queryEmbedding,
        finalRequest,
        detectedAuctionHouse,
        derivedIntent,
      ),
      retrieveByFulltext(
        supabase,
        finalRequest,
        detectedAuctionHouse,
        semanticSeedQuery,
        derivedIntent,
      ),
    ]);

    // ─── Step 3: Merge & deduplicate results ───
    mergedLots = mergeAndRank(
      vectorResults,
      fulltextResults,
      semanticSeedQuery,
    );
  }

  let contextLots = mergedLots.slice(0, MAX_CONTEXT_LOTS);

  if (contextLots.length < 6 || derivedIntent.prefersBrowse) {
    const browseFallbackLots = await retrieveBrowseFallbackLots(
      supabase,
      finalRequest,
      detectedAuctionHouse,
      derivedIntent,
      semanticSeedQuery,
    );
    const seenIds = new Set(contextLots.map((lot) => lot.id));

    contextLots = [
      ...contextLots,
      ...browseFallbackLots.filter((lot) => !seenIds.has(lot.id)),
    ].slice(0, MAX_CONTEXT_LOTS);
  }

  if (
    detectedAuctionHouse &&
    (contextLots.length < 6 || isBroadBrowseQuery(request.query))
  ) {
    const fallbackLots = await retrieveHouseBrowseFallbackLots(
      supabase,
      finalRequest,
      detectedAuctionHouse,
      derivedIntent,
      semanticSeedQuery,
    );
    const seenIds = new Set(contextLots.map((lot) => lot.id));

    contextLots = [
      ...contextLots,
      ...fallbackLots.filter((lot) => !seenIds.has(lot.id)),
    ].slice(0, MAX_CONTEXT_LOTS);
  }

  if (contextLots.length === 0) {
    return {
      answer: buildNoContextAnswer(request.query, detectedAuctionHouse),
      sources: [],
      retrievalStats: {
        vectorMatches: vectorResults.length,
        fulltextMatches: fulltextResults.length,
        totalContextLots: 0,
        queryTimeMs: Date.now() - startTime,
      },
    };
  }

  // ─── Step 4: Generate answer with Gemini ───
  const answer = await generateAnswer(request.query, contextLots);

  return {
    answer,
    sources: contextLots,
    retrievalStats: {
      vectorMatches: vectorResults.length,
      fulltextMatches: fulltextResults.length,
      totalContextLots: contextLots.length,
      queryTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Retrieve lots by vector similarity (semantic search).
 */
async function retrieveByVector(
  supabase: any,
  queryEmbedding: number[],
  request: RAGRequest,
  detectedAuctionHouse: DetectedAuctionHouse | null,
  derivedIntent: DerivedRetrievalIntent,
): Promise<RAGSourceLot[]> {
  try {
    // Use the semantic_search_lots function from our schema
    const { data, error } = await supabase.rpc("auc_semantic_search_lots", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: getSemanticMatchThreshold(request.query),
      match_count: TOP_K_VECTOR,
    });

    if (error) {
      console.error("[RAG] Vector search error:", error.message);
      return [];
    }

    // Fetch full lot details for the matched IDs
    if (!data?.length) return [];

    const lotIds = data.map((d: any) => d.lot_id);
    const similarities = new Map(
      data.map((d: any) => [d.lot_id, d.similarity]),
    );

    let lotQuery = supabase
      .from("auc_lots")
      .select(
        `id, title, description, categories, ai_categories, current_bid, estimate,
         house_id,
         currency, city, url, thumbnail_url, end_time,
         auc_auction_houses!inner(name)`,
      )
      .in("id", lotIds);

    if (detectedAuctionHouse) {
      lotQuery = lotQuery.eq("house_id", detectedAuctionHouse.id);
    }

    if (request.categories?.length) {
      lotQuery = lotQuery.overlaps("categories", request.categories);
    }

    if (request.city) {
      lotQuery = lotQuery.eq("city", request.city);
    }

    if (request.minPrice != null) {
      lotQuery = lotQuery.gte("current_bid", request.minPrice);
    }

    if (request.maxPrice != null) {
      lotQuery = lotQuery.lte("current_bid", request.maxPrice);
    }

    if (!derivedIntent.includeEnded) {
      lotQuery = lotQuery
        .gt("end_time", new Date().toISOString())
        .is("availability", null);
    }
    if (derivedIntent.endTimeFrom) {
      lotQuery = lotQuery.gte("end_time", derivedIntent.endTimeFrom);
    }
    if (derivedIntent.endTimeTo) {
      lotQuery = lotQuery.lt("end_time", derivedIntent.endTimeTo);
    }

    const { data: lots } = await lotQuery;

    return (lots ?? []).map((lot: any) => ({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      categories: lot.categories,
      aiCategories: lot.ai_categories,
      currentBid: lot.current_bid,
      estimate: lot.estimate,
      currency: lot.currency,
      city: lot.city,
      url: lot.url,
      thumbnailUrl: lot.thumbnail_url,
      endTime: lot.end_time,
      houseName: lot.auc_auction_houses?.name,
      similarity: similarities.get(lot.id),
    }));
  } catch (err) {
    console.error("[RAG] Vector retrieval failed:", err);
    return [];
  }
}

/**
 * Retrieve lots by full-text search (keyword matching).
 */
async function retrieveByFulltext(
  supabase: any,
  request: RAGRequest,
  detectedAuctionHouse: DetectedAuctionHouse | null,
  retrievalQuery: string,
  derivedIntent: DerivedRetrievalIntent,
): Promise<RAGSourceLot[]> {
  try {
    const searchWords = extractSignificantWords(
      retrievalQuery || request.query,
    );
    const searchQuery = searchWords.length
      ? searchWords.join(" ")
      : retrievalQuery || request.query;

    let query = supabase
      .from("auc_lots")
      .select(
        `id, title, description, categories, ai_categories, current_bid, estimate,
         house_id,
         currency, city, url, thumbnail_url, end_time,
         auc_auction_houses!inner(name)`,
      )
      .or(
        [
          `search_text.wfts(swedish).${encodeURIComponent(searchQuery)}`,
          ...buildQueryTextMatchClauses(searchQuery),
        ].join(","),
      )
      .limit(TOP_K_FULLTEXT);

    if (!derivedIntent.includeEnded) {
      query = query
        .gt("end_time", new Date().toISOString())
        .is("availability", null);
    }
    if (derivedIntent.endTimeFrom) {
      query = query.gte("end_time", derivedIntent.endTimeFrom);
    }
    if (derivedIntent.endTimeTo) {
      query = query.lt("end_time", derivedIntent.endTimeTo);
    }
    if (request.categories?.length) {
      query = query.overlaps("categories", request.categories);
    }
    if (request.city) {
      query = query.eq("city", request.city);
    }
    if (request.minPrice != null) {
      query = query.gte("current_bid", request.minPrice);
    }
    if (request.maxPrice != null) {
      query = query.lte("current_bid", request.maxPrice);
    }
    if (detectedAuctionHouse) {
      query = query.eq("house_id", detectedAuctionHouse.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[RAG] Fulltext search error:", error.message);
      return [];
    }

    return (data ?? []).map((lot: any) => ({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      categories: lot.categories,
      aiCategories: lot.ai_categories,
      currentBid: lot.current_bid,
      estimate: lot.estimate,
      currency: lot.currency,
      city: lot.city,
      url: lot.url,
      thumbnailUrl: lot.thumbnail_url,
      endTime: lot.end_time,
      houseName: lot.auc_auction_houses?.name,
    }));
  } catch (err) {
    console.error("[RAG] Fulltext retrieval failed:", err);
    return [];
  }
}

async function retrieveHouseBrowseFallbackLots(
  supabase: any,
  request: RAGRequest,
  detectedAuctionHouse: DetectedAuctionHouse,
  derivedIntent: DerivedRetrievalIntent,
  rankingQuery: string,
): Promise<RAGSourceLot[]> {
  try {
    let query = supabase
      .from("auc_lots")
      .select(
        `id, title, description, categories, ai_categories, current_bid, estimate,
         currency, city, url, thumbnail_url, end_time,
         auc_auction_houses!inner(name)`,
      )
      .eq("house_id", detectedAuctionHouse.id)
      .limit(36);

    if (!derivedIntent.includeEnded) {
      query = query
        .gt("end_time", new Date().toISOString())
        .is("availability", null)
        .order("end_time", { ascending: true });
    } else {
      query = query.order("end_time", { ascending: false });
    }

    if (derivedIntent.endTimeFrom) {
      query = query.gte("end_time", derivedIntent.endTimeFrom);
    }

    if (derivedIntent.endTimeTo) {
      query = query.lt("end_time", derivedIntent.endTimeTo);
    }

    if (request.categories?.length) {
      query = query.overlaps("categories", request.categories);
    }

    if (request.city) {
      query = query.eq("city", request.city);
    }

    if (request.minPrice != null) {
      query = query.gte("current_bid", request.minPrice);
    }

    if (request.maxPrice != null) {
      query = query.lte("current_bid", request.maxPrice);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[RAG] House browse fallback error:", error.message);
      return [];
    }

    const { queryTerms } = buildQueryScoringTerms(rankingQuery);
    const normalizedQuery = normalizeSearchQuery(rankingQuery);
    const primaryObjectIntent = detectPrimaryObjectIntent(rankingQuery);
    const queryModifierTerms = detectQueryModifierTerms(
      rankingQuery,
      primaryObjectIntent,
    );
    const concreteQuery = isConcreteObjectQuery(rankingQuery);

    const rankedFallbackLots: Array<{ lot: RAGSourceLot; score: number }> = (
      data ?? []
    ).map((lot: any) => {
      const mappedLot: RAGSourceLot = {
        id: lot.id,
        title: lot.title,
        description: lot.description,
        categories: lot.categories,
        aiCategories: lot.ai_categories,
        currentBid: lot.current_bid,
        estimate: lot.estimate,
        currency: lot.currency,
        city: lot.city,
        url: lot.url,
        thumbnailUrl: lot.thumbnail_url,
        endTime: lot.end_time,
        houseName: lot.auc_auction_houses?.name,
      };

      const lexical = getLexicalMatch(mappedLot, queryTerms);
      const objectMatch = evaluateLotObjectMatch(
        mappedLot,
        primaryObjectIntent,
      );
      const modifierMatch = evaluateModifierMatch(
        mappedLot,
        queryModifierTerms,
      );
      const collectionMatch = evaluateCollectionMatch(mappedLot);
      const exactPhrase =
        normalizedQuery.length >= 3 &&
        normalizeText(mappedLot.title ?? "").includes(normalizedQuery);
      const endsAt = mappedLot.endTime
        ? new Date(mappedLot.endTime).getTime()
        : null;
      const msLeft =
        endsAt != null ? endsAt - Date.now() : Number.POSITIVE_INFINITY;
      const urgencyBoost =
        msLeft <= 86_400_000 ? 1.5 : msLeft <= 3 * 86_400_000 ? 0.9 : 0.35;
      const bidAmount = mappedLot.currentBid ?? 0;
      const estimateAmount = mappedLot.estimate ?? 0;
      const bargainDelta =
        estimateAmount > 0 ? (estimateAmount - bidAmount) / estimateAmount : 0;
      const bargainBoost =
        estimateAmount > 0
          ? bargainDelta > 0
            ? bargainDelta * 4
            : bargainDelta * 1.5
          : bidAmount === 0
            ? 0.6
            : 0;

      return {
        lot: mappedLot,
        score:
          lexical.score * 1.15 +
          (exactPhrase ? 4 : 0) +
          urgencyBoost +
          bargainBoost +
          getObjectAwareScoreBoost(objectMatch, concreteQuery) +
          getModifierAwareScoreBoost(
            modifierMatch,
            queryModifierTerms,
            concreteQuery,
          ) +
          getCollectionAwareScorePenalty(
            collectionMatch,
            concreteQuery,
            Boolean(primaryObjectIntent) || queryModifierTerms.length > 0,
          ),
      };
    });

    const modifierQualifiedCount = rankedFallbackLots.filter(
      (entry: { lot: RAGSourceLot; score: number }) =>
        evaluateModifierMatch(entry.lot, queryModifierTerms).hasMatch,
    ).length;

    return rankedFallbackLots
      .filter(
        (entry: { lot: RAGSourceLot; score: number }) =>
          !shouldRequirePrimaryObjectMatch(
            rankingQuery,
            primaryObjectIntent,
            rankedFallbackLots.filter(
              (candidate: { lot: RAGSourceLot; score: number }) =>
                evaluateLotObjectMatch(candidate.lot, primaryObjectIntent)
                  .hasMatch,
            ).length,
          ) || evaluateLotObjectMatch(entry.lot, primaryObjectIntent).hasMatch,
      )
      .filter(
        (entry: { lot: RAGSourceLot; score: number }) =>
          !shouldRequireModifierMatch(
            rankingQuery,
            queryModifierTerms,
            modifierQualifiedCount,
          ) || evaluateModifierMatch(entry.lot, queryModifierTerms).hasMatch,
      )
      .filter(
        (
          entry: { lot: RAGSourceLot; score: number },
          _index: number,
          entries: Array<{ lot: RAGSourceLot; score: number }>,
        ) =>
          !(
            concreteQuery &&
            (primaryObjectIntent || queryModifierTerms.length > 0) &&
            entries.filter(
              (candidate: { lot: RAGSourceLot; score: number }) =>
                !evaluateCollectionMatch(candidate.lot).hasMatch,
            ).length >= 4 &&
            evaluateCollectionMatch(entry.lot).hasMatch
          ),
      )
      .sort(
        (
          left: { lot: RAGSourceLot; score: number },
          right: { lot: RAGSourceLot; score: number },
        ) => right.score - left.score,
      )
      .map((entry: { lot: RAGSourceLot; score: number }) => entry.lot)
      .slice(0, MAX_CONTEXT_LOTS);
  } catch (err) {
    console.error("[RAG] House browse fallback failed:", err);
    return [];
  }
}

async function retrieveBrowseFallbackLots(
  supabase: any,
  request: RAGRequest,
  detectedAuctionHouse: DetectedAuctionHouse | null,
  derivedIntent: DerivedRetrievalIntent,
  rankingQuery: string,
): Promise<RAGSourceLot[]> {
  try {
    let query = supabase
      .from("auc_lots")
      .select(
        `id, title, description, categories, ai_categories, current_bid, estimate,
         house_id,
         currency, city, url, thumbnail_url, end_time,
         auc_auction_houses!inner(name)`,
      )
      .limit(36);

    if (detectedAuctionHouse) {
      query = query.eq("house_id", detectedAuctionHouse.id);
    }

    if (!derivedIntent.includeEnded) {
      query = query
        .gt("end_time", new Date().toISOString())
        .is("availability", null)
        .order("end_time", { ascending: true });
    } else {
      query = query.order("end_time", { ascending: false });
    }

    if (derivedIntent.endTimeFrom) {
      query = query.gte("end_time", derivedIntent.endTimeFrom);
    }

    if (derivedIntent.endTimeTo) {
      query = query.lt("end_time", derivedIntent.endTimeTo);
    }

    if (request.categories?.length) {
      query = query.overlaps("categories", request.categories);
    }

    if (request.city) {
      query = query.eq("city", request.city);
    }

    if (request.minPrice != null) {
      query = query.gte("current_bid", request.minPrice);
    }

    if (request.maxPrice != null) {
      query = query.lte("current_bid", request.maxPrice);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[RAG] Browse fallback error:", error.message);
      return [];
    }

    const { queryTerms } = buildQueryScoringTerms(rankingQuery);
    const normalizedQuery = normalizeSearchQuery(rankingQuery);
    const primaryObjectIntent = detectPrimaryObjectIntent(rankingQuery);
    const queryModifierTerms = detectQueryModifierTerms(
      rankingQuery,
      primaryObjectIntent,
    );
    const concreteQuery = isConcreteObjectQuery(rankingQuery);

    const rankedLots = (data ?? []).map((lot: any) => {
      const mappedLot: RAGSourceLot = {
        id: lot.id,
        title: lot.title,
        description: lot.description,
        categories: lot.categories,
        aiCategories: lot.ai_categories,
        currentBid: lot.current_bid,
        estimate: lot.estimate,
        currency: lot.currency,
        city: lot.city,
        url: lot.url,
        thumbnailUrl: lot.thumbnail_url,
        endTime: lot.end_time,
        houseName: lot.auc_auction_houses?.name,
      };

      const lexical = getLexicalMatch(mappedLot, queryTerms);
      const objectMatch = evaluateLotObjectMatch(
        mappedLot,
        primaryObjectIntent,
      );
      const modifierMatch = evaluateModifierMatch(
        mappedLot,
        queryModifierTerms,
      );
      const collectionMatch = evaluateCollectionMatch(mappedLot);
      const exactPhrase =
        normalizedQuery.length >= 3 &&
        normalizeText(mappedLot.title ?? "").includes(normalizedQuery);
      const endsAt = mappedLot.endTime
        ? new Date(mappedLot.endTime).getTime()
        : Number.POSITIVE_INFINITY;
      const msLeft = endsAt - Date.now();
      const urgencyBoost =
        msLeft <= 12 * 60 * 60 * 1000
          ? 4
          : msLeft <= 24 * 60 * 60 * 1000
            ? 2.5
            : msLeft <= 3 * 24 * 60 * 60 * 1000
              ? 1.2
              : 0.4;

      return {
        lot: mappedLot,
        score:
          urgencyBoost +
          lexical.score * 1.2 +
          (exactPhrase ? 5 : 0) +
          getObjectAwareScoreBoost(objectMatch, concreteQuery) +
          getModifierAwareScoreBoost(
            modifierMatch,
            queryModifierTerms,
            concreteQuery,
          ) +
          getCollectionAwareScorePenalty(
            collectionMatch,
            concreteQuery,
            Boolean(primaryObjectIntent) || queryModifierTerms.length > 0,
          ),
      };
    });

    const objectQualifiedCount = rankedLots.filter(
      (entry: { lot: RAGSourceLot; score: number }) =>
        evaluateLotObjectMatch(entry.lot, primaryObjectIntent).hasMatch,
    ).length;
    const modifierQualifiedCount = rankedLots.filter(
      (entry: { lot: RAGSourceLot; score: number }) =>
        evaluateModifierMatch(entry.lot, queryModifierTerms).hasMatch,
    ).length;

    return rankedLots
      .filter(
        (entry: { lot: RAGSourceLot; score: number }) =>
          !shouldRequirePrimaryObjectMatch(
            rankingQuery,
            primaryObjectIntent,
            objectQualifiedCount,
          ) || evaluateLotObjectMatch(entry.lot, primaryObjectIntent).hasMatch,
      )
      .filter(
        (entry: { lot: RAGSourceLot; score: number }) =>
          !shouldRequireModifierMatch(
            rankingQuery,
            queryModifierTerms,
            modifierQualifiedCount,
          ) || evaluateModifierMatch(entry.lot, queryModifierTerms).hasMatch,
      )
      .filter(
        (
          entry: { lot: RAGSourceLot; score: number },
          _index: number,
          entries: Array<{ lot: RAGSourceLot; score: number }>,
        ) =>
          !(
            concreteQuery &&
            (primaryObjectIntent || queryModifierTerms.length > 0) &&
            entries.filter(
              (candidate: { lot: RAGSourceLot; score: number }) =>
                !evaluateCollectionMatch(candidate.lot).hasMatch,
            ).length >= 4 &&
            evaluateCollectionMatch(entry.lot).hasMatch
          ),
      )
      .sort(
        (left: { score: number }, right: { score: number }) =>
          right.score - left.score,
      )
      .map((entry: { lot: RAGSourceLot }) => entry.lot)
      .slice(0, MAX_CONTEXT_LOTS);
  } catch (err) {
    console.error("[RAG] Browse fallback failed:", err);
    return [];
  }
}

/**
 * Merge vector and fulltext results, deduplicate, and rank.
 * Lots appearing in both lists get a boost.
 */
function mergeAndRank(
  vectorLots: RAGSourceLot[],
  fulltextLots: RAGSourceLot[],
  userQuery: string,
): RAGSourceLot[] {
  const mergedLots: RAGSourceLot[] = [];
  const seenIds = new Set<number>();
  const vectorOrder = new Map(vectorLots.map((lot, idx) => [lot.id, idx]));
  const similarityById = new Map(
    vectorLots.map((lot) => [lot.id, lot.similarity ?? 0]),
  );
  const fulltextOrder = new Map(fulltextLots.map((lot, idx) => [lot.id, idx]));

  for (const lot of [...vectorLots, ...fulltextLots]) {
    if (seenIds.has(lot.id)) {
      continue;
    }

    seenIds.add(lot.id);
    mergedLots.push(lot);
  }

  return rankLotsByRelevance(mergedLots, userQuery, "relevance", {
    vectorOrder,
    extraScore: (lot) => {
      const similarityBoost = (similarityById.get(lot.id) ?? 0) * 2.4;
      const fulltextIndex = fulltextOrder.get(lot.id);
      const fulltextBoost =
        fulltextIndex == null
          ? 0
          : 0.75 + (TOP_K_FULLTEXT - fulltextIndex) * 0.04;
      const overlapBoost =
        similarityById.has(lot.id) && fulltextIndex != null ? 0.75 : 0;

      return similarityBoost + fulltextBoost + overlapBoost;
    },
  });
}

/**
 * Generate a natural language answer using Gemini with the retrieved context.
 */
async function generateAnswer(
  userQuery: string,
  contextLots: RAGSourceLot[],
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const now = new Date();
  const currentDateIso = now.toISOString();
  const currentDateSwedish = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);

  // Build context block from retrieved lots
  const contextBlock = contextLots
    .map((lot, i) => {
      const parts = [
        `[${i + 1}] "${lot.title}"`,
        lot.houseName ? `Auktionshus: ${lot.houseName}` : null,
        lot.categories?.length
          ? `Kategori: ${lot.categories.join(", ")}`
          : null,
        lot.aiCategories?.length
          ? `AI-kategorier: ${lot.aiCategories.join(", ")}`
          : null,
        lot.description ? `Beskrivning: ${lot.description}` : null,
        lot.currentBid ? `Bud: ${formatSEK(lot.currentBid)}` : null,
        lot.estimate ? `Utrop: ${formatSEK(lot.estimate)}` : null,
        lot.endTime ? `Slutar: ${formatDate(lot.endTime)}` : null,
        lot.city ? `Plats: ${lot.city}` : null,
        lot.url ? `Länk: ${lot.url}` : null,
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");

  const systemPrompt = `Du är Auktio AI, en hjälpsam auktionsassistent för svenska auktioner.
Du har tillgång till ett urval av aktuella auktionsföremål som kontext.

REGLER:
- Svara ALLTID på svenska
- Idag är ${currentDateSwedish} (Stockholmstid). Om du använder ord som "idag", "imorgon", "i dag" eller nämner dagens datum måste du utgå exakt från detta datum
- Du får ALDRIG hitta på ett annat aktuellt datum än ${currentDateSwedish}
- Basera dina svar på de föremål som finns i kontexten
- Kontexten är sorterad i relevansordning. [1] är mest relevant, sedan [2], [3] och så vidare
- Referera till specifika föremål med deras titel och auktionshus
- Om du rekommenderar föremål, förklara VARFÖR de matchar frågan
- Om du nämner konkreta föremål ska du välja dem från början av kontexten och behålla samma ordning som i kontexten
- Nämn inte ett föremål längre ner i kontexten före ett mer relevant föremål högre upp om båda matchar frågan
- Om kontexten inte innehåller relevant information, säg det ärligt
- Ge inte generella auktionsråd om de inte tydligt stöds av kontexten
- Om sluttid finns i kontexten ska du använda den, särskilt vid frågor om "slutar snart"
- Var koncis men informativ
- Nämn prisuppgifter (bud och utrop) när det är relevant
- Inkludera ALDRIG föremålsnummer som [1], [2] etc i ditt svar — referera med namn istället
- Om användaren frågar om trender eller jämförelser, analysera de tillgängliga föremålen
- Om kontexten är tunn eller svag, säg att underlaget är begränsat i stället för att fylla ut med allmänna råd

FORMAT:
- Om du nämner två eller fler konkreta föremål, börja med rubriken "Föremål:" och lista dem på separata rader
- Varje rad i listan ska ha formatet "• titel, auktionshus, bud, utrop". Använd tecknet "•" i början av varje rad. Utelämna bara den prisuppgift som saknas
- Om du listar konkreta föremål ska listan följa samma ordning som kontexten och prioritera de 3 första relevanta objekten
- Efter listan kan du ge en kort sammanfattning eller rekommendation i löpande text
- Håll svaret under 300 ord
- Avsluta gärna med ett relevant tips eller förslag`;

  const userPrompt = `DAGENS DATUM: ${currentDateSwedish}
TIDSANKARE (ISO): ${currentDateIso}

KONTEXT — Aktuella auktionsföremål:

${contextBlock}

---

FRÅGA: ${userQuery}`;

  const startedAt = Date.now();

  const response = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
        topP: 0.9,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    await logAiUsage({
      provider: "google",
      model: "gemini-2.0-flash",
      operation: "rag-answer",
      status: "error",
      latencyMs: Date.now() - startedAt,
      errorMessage: `Gemini generation error ${response.status}: ${err}`,
      itemCount: contextLots.length,
    });
    throw new Error(`Gemini generation error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const usage = extractGeminiUsageMetadata(data);
  await logAiUsage({
    provider: "google",
    model: "gemini-2.0-flash",
    operation: "rag-answer",
    status: "success",
    latencyMs: Date.now() - startedAt,
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
    itemCount: contextLots.length,
  });
  const answer =
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    "Jag kunde tyvärr inte generera ett svar just nu.";

  return normalizeAnswerBullets(answer);
}
