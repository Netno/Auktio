import {
  normalizeSearchText,
  normalizeSwedishSearchQuery,
} from "./search-language";

export type SearchConceptId =
  | "garden"
  | "wall-display"
  | "storage"
  | "table-setting";

export interface SearchQueryUnderstanding {
  normalizedQuery: string;
  normalizedRawQuery: string;
  concepts: SearchConceptId[];
  expansionTerms: string[];
  semanticPhrases: string[];
}

export interface SearchQueryUnderstandingLotFields {
  title?: string | null;
  description?: string | null;
  categories?: string[] | null;
  aiCategories?: string[] | null;
}

export interface QueryUnderstandingMatchEvaluation {
  score: number;
  hasMatch: boolean;
  hasStrongMatch: boolean;
  matchedConcepts: SearchConceptId[];
}

type SearchConceptDefinition = {
  id: SearchConceptId;
  triggerTerms: string[];
  triggerPhrases?: string[];
  expansionTerms: string[];
  semanticPhrases?: string[];
  titleStrongResultTerms?: string[];
  strongResultTerms: string[];
  resultTerms: string[];
  penaltyTerms?: string[];
};

const SEARCH_CONCEPTS: SearchConceptDefinition[] = [
  {
    id: "garden",
    triggerTerms: [
      "trädgård",
      "tradgard",
      "utomhus",
      "uteplats",
      "altan",
      "balkong",
      "ute",
    ],
    expansionTerms: [
      "trädgårdsmöbel",
      "trädgårdsmöbler",
      "utemöbel",
      "utemöbler",
      "trädgårdsstol",
      "trädgårdsstolar",
      "trädgårdsbord",
      "trädgårdskrukor",
      "trädgårdsskulpturer",
      "trädgårdsurna",
      "trädgårdsurnor",
    ],
    semanticPhrases: ["utomhusmöbler", "föremål för trädgården"],
    strongResultTerms: [
      "trädgårdsmöbel",
      "trädgårdsmöbler",
      "trädgårdsstol",
      "trädgårdsstolar",
      "trädgårdsbord",
    ],
    resultTerms: [
      "trädgård",
      "utemöbel",
      "utemöbler",
      "kruka",
      "krukor",
      "urna",
      "urnor",
      "skulptur",
      "skulpturer",
    ],
  },
  {
    id: "wall-display",
    triggerTerms: [
      "vägg",
      "vagg",
      "hänga",
      "hanga",
      "häng",
      "hang",
      "väggdekor",
      "vaggdekor",
    ],
    triggerPhrases: [
      "på väggen",
      "pa vaggen",
      "hänga på väggen",
      "hanga pa vaggen",
    ],
    expansionTerms: [
      "tavla",
      "målning",
      "litografi",
      "grafik",
      "affisch",
      "poster",
      "väggrelief",
      "väggur",
      "spegel",
      "väggspegel",
      "vägghylla",
      "vägglampa",
    ],
    semanticPhrases: ["föremål för väggen", "väggmonterade föremål"],
    titleStrongResultTerms: [
      "väggrelief",
      "väggur",
      "väggspegel",
      "tavla",
      "affisch",
      "poster",
      "spegel",
      "vägghylla",
      "vägglampa",
    ],
    strongResultTerms: [
      "väggrelief",
      "väggur",
      "väggspegel",
      "tavla",
      "affisch",
      "poster",
      "spegel",
      "vägghylla",
      "vägglampa",
    ],
    resultTerms: [
      "målning",
      "litografi",
      "grafik",
      "ram",
      "ramad",
      "inramad",
      "målning",
      "vägg",
      "relief",
      "hylla",
      "lampa",
    ],
    penaltyTerms: [
      "hänge",
      "hängen",
      "halsband",
      "örhängen",
      "brosch",
      "broscher",
      "armband",
      "medaljong",
      "smycke",
      "smycken",
    ],
  },
  {
    id: "storage",
    triggerTerms: ["förvaring", "forvaring", "förvara", "forvara"],
    expansionTerms: [
      "skåp",
      "vitrinskåp",
      "bokhylla",
      "hylla",
      "byrå",
      "kista",
      "koffert",
      "skrin",
      "låda",
    ],
    semanticPhrases: ["möbler för förvaring"],
    strongResultTerms: ["skåp", "hylla", "byrå", "kista", "koffert"],
    resultTerms: ["skrin", "låda", "förvaring", "vitrin", "bokhylla"],
  },
  {
    id: "table-setting",
    triggerTerms: ["dukning", "duka", "servera", "servering", "borddukning"],
    triggerPhrases: ["det dukade bordet"],
    expansionTerms: [
      "servis",
      "tallrik",
      "tallrikar",
      "skål",
      "skålar",
      "glas",
      "karaff",
      "bestick",
      "fat",
      "ljusstake",
      "koppar",
      "tekanna",
    ],
    semanticPhrases: ["föremål för dukning"],
    strongResultTerms: [
      "servis",
      "tallrik",
      "tallrikar",
      "bestick",
      "glas",
      "karaff",
    ],
    resultTerms: ["skål", "skålar", "fat", "ljusstake", "kopp", "koppar"],
  },
];

function hasTerm(text: string, term: string) {
  return text.includes(term);
}

function getCombinedLotText(lot: SearchQueryUnderstandingLotFields) {
  return normalizeSearchText(
    [
      lot.title ?? "",
      lot.description ?? "",
      (lot.categories ?? []).join(" "),
      (lot.aiCategories ?? []).join(" "),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function understandSearchQuery(query: string): SearchQueryUnderstanding {
  const normalizedRawQuery = normalizeSearchText(query);
  const normalizedQuery = normalizeSwedishSearchQuery(query);
  const concepts: SearchConceptId[] = [];
  const expansionTerms = new Set<string>();
  const semanticPhrases = new Set<string>();

  for (const concept of SEARCH_CONCEPTS) {
    const hasTriggerTerm = concept.triggerTerms.some(
      (term) =>
        hasTerm(normalizedRawQuery, term) || hasTerm(normalizedQuery, term),
    );
    const hasTriggerPhrase = concept.triggerPhrases?.some((phrase) =>
      hasTerm(normalizedRawQuery, phrase),
    );

    if (!hasTriggerTerm && !hasTriggerPhrase) {
      continue;
    }

    concepts.push(concept.id);

    for (const term of concept.expansionTerms) {
      expansionTerms.add(term);
    }

    for (const phrase of concept.semanticPhrases ?? []) {
      semanticPhrases.add(phrase);
    }
  }

  return {
    normalizedQuery,
    normalizedRawQuery,
    concepts,
    expansionTerms: Array.from(expansionTerms),
    semanticPhrases: Array.from(semanticPhrases),
  };
}

export function getQueryUnderstandingTerms(query: string) {
  return understandSearchQuery(query).expansionTerms;
}

export function getQueryUnderstandingSemanticPhrases(query: string) {
  return understandSearchQuery(query).semanticPhrases;
}

export function evaluateQueryUnderstandingMatch(
  lot: SearchQueryUnderstandingLotFields,
  understanding: SearchQueryUnderstanding,
): QueryUnderstandingMatchEvaluation {
  if (!understanding.concepts.length) {
    return {
      score: 0,
      hasMatch: false,
      hasStrongMatch: false,
      matchedConcepts: [],
    };
  }

  const combinedText = getCombinedLotText(lot);
  const normalizedTitle = normalizeSearchText(lot.title ?? "");
  let score = 0;
  let hasMatch = false;
  let hasStrongMatch = false;
  const matchedConcepts: SearchConceptId[] = [];

  for (const conceptId of understanding.concepts) {
    const concept = SEARCH_CONCEPTS.find((item) => item.id === conceptId);
    if (!concept) {
      continue;
    }

    const matchedStrongTerm = concept.strongResultTerms.find((term) =>
      hasTerm(combinedText, term),
    );
    const matchedTitleStrongTerm = concept.titleStrongResultTerms?.find(
      (term) => hasTerm(normalizedTitle, term),
    );
    const matchedResultTerm = concept.resultTerms.find((term) =>
      hasTerm(combinedText, term),
    );
    const matchedPenaltyTerm = concept.penaltyTerms?.find((term) =>
      hasTerm(combinedText, term),
    );

    if (matchedTitleStrongTerm) {
      score += 22;
      hasMatch = true;
      hasStrongMatch = true;
      matchedConcepts.push(concept.id);
      continue;
    }

    if (matchedStrongTerm) {
      score += 16;
      hasMatch = true;
      hasStrongMatch = true;
      matchedConcepts.push(concept.id);
      continue;
    }

    if (matchedResultTerm) {
      score += 8;
      hasMatch = true;
      matchedConcepts.push(concept.id);
    }

    if (matchedPenaltyTerm && !matchedResultTerm && !matchedStrongTerm) {
      score -= 10;
    }
  }

  return {
    score,
    hasMatch,
    hasStrongMatch,
    matchedConcepts,
  };
}

export function shouldRequireQueryUnderstandingMatch(
  understanding: SearchQueryUnderstanding,
  qualifiedCount: number,
) {
  return understanding.concepts.length > 0 && qualifiedCount >= 4;
}
