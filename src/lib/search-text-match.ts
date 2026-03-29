import {
  expandSwedishSemanticQueryTerms as expandSemanticTerms,
  extractSwedishQueryTerms as extractQueryTerms,
  normalizeSwedishSearchQuery as normalizeSearchQuery,
} from "./search-language";
import { extractCompoundDescriptorTerms } from "./search-object-intent";

export function buildQueryTextMatchTerms(query: string) {
  const normalizedQuery = normalizeSearchQuery(query);

  return Array.from(
    new Set(
      [
        normalizedQuery,
        ...normalizedQuery.split(" "),
        ...extractQueryTerms(query),
        ...expandSemanticTerms(query),
        ...extractCompoundDescriptorTerms(query),
      ]
        .flatMap((value) => value.split(" "))
        .map((value) => value.trim())
        .filter((value) => value.length >= 3),
    ),
  );
}

export function buildQueryTextMatchClauses(
  query: string,
  fields: string[] = ["title", "description"],
) {
  return Array.from(
    new Set(
      buildQueryTextMatchTerms(query).flatMap((term) =>
        fields.map((field) => `${field}.ilike.%${term}%`),
      ),
    ),
  );
}

export function buildQueryScoringTerms(query: string) {
  const queryTerms = Array.from(
    new Set(
      [...extractQueryTerms(query), ...extractCompoundDescriptorTerms(query)]
        .flatMap((value) => value.split(" "))
        .map((value) => value.trim())
        .filter((value) => value.length >= 3),
    ),
  );

  const expandedQueryTerms = buildQueryTextMatchTerms(query).filter(
    (term) => !queryTerms.includes(term),
  );

  return {
    queryTerms,
    expandedQueryTerms,
  };
}
