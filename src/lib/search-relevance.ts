import {
  buildSwedishWordRoots as buildWordRoots,
  normalizeSearchText as normalizeText,
  normalizeSwedishSearchQuery as normalizeSearchQuery,
} from "@/lib/search-language";
import { buildQueryScoringTerms } from "@/lib/search-text-match";
import {
  detectPrimaryObjectIntent,
  detectQueryModifierTerms,
  evaluateCollectionMatch,
  evaluateModifierMatch,
  evaluateObjectMatch,
  getBaseQueryTermWeight,
  getCollectionAwareScorePenalty,
  getModifierAwareScoreBoost,
  getObjectAwareScoreBoost,
  shouldRequirePrimaryObjectMatch,
  shouldRequireModifierMatch,
} from "@/lib/search-object-intent";
import type { SortOption } from "@/lib/types";

export interface RankableLot {
  id: number;
  title: string;
  description?: string | null;
  categories?: string[] | null;
  aiCategories?: string[] | null;
  artists?: string[] | null;
  currentBid?: number | null;
  soldPrice?: number | null;
  estimate?: number | null;
  createdAt?: string | null;
  endTime?: string | null;
  availability?: string | null;
}

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

function matchesTerm(tokens: string[], term: string) {
  return tokens.some((token) => token === term || token.endsWith(term));
}

export function getLexicalScore(
  lot: RankableLot,
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

export function isConcreteObjectQuery(query: string) {
  const normalized = normalizeSearchQuery(query);
  const words = normalized.split(" ").filter(Boolean);
  return words.length > 0 && words.length <= 3;
}

function getVectorRankScore(vectorOrder: Map<number, number>, lotId: number) {
  const position = vectorOrder.get(lotId);
  if (position == null) return 0;
  return 1 / (position + 1);
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

export function sortRankedLots<T extends RankableLot>(
  lots: T[],
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

export function rankLotsByRelevance<T extends RankableLot>(
  lots: T[],
  query: string,
  sortBy: SortOption = "relevance",
  options?: {
    vectorOrder?: Map<number, number>;
    extraScore?: (lot: T) => number;
  },
) {
  const { queryTerms, expandedQueryTerms } = buildQueryScoringTerms(query);
  const normalizedQuery = normalizeSearchQuery(query);
  const concreteQuery = isConcreteObjectQuery(query);
  const primaryObjectIntent = detectPrimaryObjectIntent(query);
  const queryModifierTerms = detectQueryModifierTerms(
    query,
    primaryObjectIntent,
  );
  const vectorOrder = options?.vectorOrder ?? new Map<number, number>();
  const extraScore = options?.extraScore ?? (() => 0);

  const rankedEntries = lots
    .map((lot) => {
      const lexicalScore = getLexicalScore(
        lot,
        queryTerms,
        getBaseQueryTermWeight,
      );
      const expandedLexicalScore = getLexicalScore(
        lot,
        expandedQueryTerms,
        getExpandedTermWeight,
      );
      const vectorScore = getVectorRankScore(vectorOrder, lot.id);
      const normalizedTitle = normalizeText(lot.title ?? "");
      const normalizedCategories = normalizeText(
        (lot.categories ?? []).join(" "),
      );
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
      const objectMatch = evaluateObjectMatch(lot, primaryObjectIntent);
      const modifierMatch = evaluateModifierMatch(lot, queryModifierTerms);
      const collectionMatch = evaluateCollectionMatch(lot);

      let score =
        lexicalScore * (concreteQuery ? 1.8 : 1.2) +
        expandedLexicalScore * (concreteQuery ? 1.15 : 0.75) +
        vectorScore * 3 +
        extraScore(lot);

      if (primaryObjectIntent) {
        score += getObjectAwareScoreBoost(objectMatch, concreteQuery);
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
        lot,
        score,
        lexicalScore,
        expandedLexicalScore,
        hasExactPhrase,
        hasObjectMatch: objectMatch.hasMatch,
        hasModifierMatch: modifierMatch.hasMatch,
        hasCollectionMatch: collectionMatch.hasMatch,
      };
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
    query,
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
    query,
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

  const rankedLots = rowsAfterCollectionFilter.map((entry) => entry.lot);
  const relevanceOrder = new Map(rankedLots.map((lot, idx) => [lot.id, idx]));
  sortRankedLots(rankedLots, sortBy, relevanceOrder);
  return rankedLots;
}
