import {
  buildSwedishWordRoots as buildWordRoots,
  normalizeSearchText as normalizeText,
  normalizeSwedishSearchQuery as normalizeSearchQuery,
} from "./search-language";

export interface DetectedObjectIntent {
  family: string;
  matchedTerm: string;
  aliases: string[];
}

export interface ObjectMatchEvaluation {
  score: number;
  hasMatch: boolean;
  hasStrongMatch: boolean;
}

export interface ModifierMatchEvaluation {
  score: number;
  matchedTerms: string[];
  hasMatch: boolean;
  hasStrongMatch: boolean;
}

export interface CollectionMatchEvaluation {
  score: number;
  hasMatch: boolean;
  hasStrongMatch: boolean;
}

export interface SearchObjectFields {
  title?: string | null;
  categories?: string[] | null;
  aiCategories?: string[] | null;
  description?: string | null;
}

const LOW_SIGNAL_QUERY_TERMS = new Set([
  "antik",
  "antika",
  "antikt",
  "gammal",
  "gamla",
  "gammalt",
  "äldre",
  "aldre",
  "fin",
  "fina",
  "fint",
  "vacker",
  "vackra",
  "vackert",
  "unik",
  "unika",
  "ovanlig",
  "ovanliga",
]);

const QUERY_MODIFIER_TERMS = new Set([
  ...LOW_SIGNAL_QUERY_TERMS,
  "modern",
  "moderna",
  "stil",
  "stor",
  "stora",
  "liten",
  "litet",
  "små",
  "vit",
  "vita",
  "svart",
  "svarta",
  "brun",
  "bruna",
  "mahogny",
  "ek",
  "furu",
  "björk",
  "glasskiva",
  "allmoge",
  "rokoko",
  "gustaviansk",
  "jugend",
  "barock",
  "funkis",
  "retro",
  "vintage",
]);

const SIGNIFICANT_QUERY_MODIFIER_TERMS = new Set([
  "mahogny",
  "ek",
  "furu",
  "björk",
  "teak",
  "allmoge",
  "rokoko",
  "gustaviansk",
  "jugend",
  "barock",
  "funkis",
  "retro",
  "vintage",
  "renässans",
  "renassans",
  "empire",
  "metall",
  "glas",
  "målad",
  "malad",
]);

const COLLECTION_TERMS = new Set([
  "parti",
  "partier",
  "diverse",
  "samling",
  "blandat",
  "blandade",
  "assorterat",
  "assorterade",
  "föremål",
  "foremal",
  "objekt",
  "lot",
]);

const OBJECT_FAMILY_ALIASES: Record<string, string[]> = {
  skåp: [
    "skåp",
    "skap",
    "kabinettskåp",
    "kabinettskap",
    "vitrinskåp",
    "vitrinskap",
    "hörnskåp",
    "hornskap",
    "bokskåp",
    "bokskap",
    "barskåp",
    "barskap",
    "linneskåp",
    "linneskap",
    "klädskåp",
    "kladskap",
    "överskåp",
    "overskap",
    "serveringsskåp",
    "serveringsskap",
    "hängskåp",
    "hangskap",
  ],
  byrå: ["byrå", "byra", "chiffonjé", "chiffonje", "kommod"],
  bord: [
    "bord",
    "matbord",
    "soffbord",
    "skrivbord",
    "sideboard",
    "avlastningsbord",
    "spelbord",
  ],
  stol: [
    "stol",
    "stolar",
    "fåtölj",
    "fatolj",
    "pall",
    "bänk",
    "bank",
    "karmstol",
  ],
  soffa: ["soffa", "divan", "bäddsoffa", "baddsoffa", "schäslong", "schaslong"],
  hylla: ["hylla", "bokhylla", "vägghylla", "vagghylla", "ställ", "stall"],
  tavla: [
    "tavla",
    "målning",
    "malning",
    "oljemålning",
    "oljemalning",
    "akvarell",
    "grafik",
    "litografi",
  ],
  skål: ["skål", "skal", "fat", "tallrik", "urna", "vas", "servis", "karaff"],
  bestick: [
    "bestick",
    "sked",
    "skedar",
    "gaffel",
    "gafflar",
    "kniv",
    "knivar",
    "slev",
  ],
  spegel: ["spegel", "väggspegel", "vaggspegel", "golvspegel"],
  lampa: [
    "lampa",
    "golvlampa",
    "taklampa",
    "bordslampa",
    "ljusstake",
    "armatur",
  ],
  kista: ["kista", "kistor", "koffert", "skrin"],
};

const OBJECT_FAMILY_MATCHERS = Object.entries(OBJECT_FAMILY_ALIASES).map(
  ([family, aliases]) => ({
    family,
    aliases: Array.from(
      new Set(aliases.map((alias) => normalizeText(alias)).filter(Boolean)),
    ).sort((a, b) => b.length - a.length),
  }),
);

const COMPOUND_DESCRIPTOR_SUFFIXES = Array.from(
  new Set(
    [
      ...Object.values(OBJECT_FAMILY_ALIASES).flat(),
      "möbel",
      "möbler",
      "mobel",
      "mobler",
      "grupp",
      "grupper",
      "set",
    ]
      .map((value) => normalizeText(value))
      .filter((value) => value.length >= 3),
  ),
).sort((a, b) => b.length - a.length);

export function getBaseQueryTermWeight(term: string) {
  return LOW_SIGNAL_QUERY_TERMS.has(term) ? 0.35 : 1;
}

function buildNormalizedRoots(value: string) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter(Boolean)
      .flatMap((token) => buildWordRoots(token)),
  );
}

function splitNormalizedTokens(value: string) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function normalizeCompoundPrefix(prefix: string) {
  return prefix.replace(/s$/u, "").trim();
}

export function extractCompoundDescriptorTerms(query: string) {
  const terms = new Set<string>();
  const normalizedWords = normalizeSearchQuery(query)
    .split(" ")
    .filter(Boolean);

  for (const word of normalizedWords) {
    for (const suffix of COMPOUND_DESCRIPTOR_SUFFIXES) {
      if (word === suffix || !word.endsWith(suffix)) {
        continue;
      }

      const prefix = normalizeCompoundPrefix(word.slice(0, -suffix.length));
      if (prefix.length < 4) {
        continue;
      }

      terms.add(prefix);

      for (const root of buildWordRoots(prefix)) {
        if (root.length >= 4) {
          terms.add(root);
        }
      }
    }
  }

  return Array.from(terms);
}

function hasAliasMatch(
  normalizedValue: string,
  roots: Set<string>,
  aliases: string[],
) {
  return aliases.some((alias) => {
    if (alias.includes(" ")) {
      return normalizedValue.includes(alias);
    }

    return Array.from(roots).some(
      (root) =>
        root === alias ||
        root.endsWith(alias) ||
        normalizedValue.endsWith(alias),
    );
  });
}

export function detectPrimaryObjectIntent(
  query: string,
): DetectedObjectIntent | null {
  const normalizedWords = normalizeSearchQuery(query)
    .split(" ")
    .filter(Boolean);

  for (let index = normalizedWords.length - 1; index >= 0; index -= 1) {
    const term = normalizedWords[index];
    if (QUERY_MODIFIER_TERMS.has(term)) {
      continue;
    }

    const roots = new Set(buildWordRoots(term));

    for (const matcher of OBJECT_FAMILY_MATCHERS) {
      if (hasAliasMatch(term, roots, matcher.aliases)) {
        return {
          family: matcher.family,
          matchedTerm: term,
          aliases: matcher.aliases,
        };
      }
    }
  }

  return null;
}

export function detectQueryModifierTerms(
  query: string,
  objectIntent: DetectedObjectIntent | null,
) {
  const modifiers = new Set<string>();
  const normalizedWords = normalizeSearchQuery(query)
    .split(" ")
    .filter(Boolean);

  for (const word of normalizedWords) {
    if (SIGNIFICANT_QUERY_MODIFIER_TERMS.has(word)) {
      modifiers.add(word);
    }

    for (const root of buildWordRoots(word)) {
      if (SIGNIFICANT_QUERY_MODIFIER_TERMS.has(root)) {
        modifiers.add(root);
      }
    }

    if (!objectIntent) {
      continue;
    }

    for (const alias of objectIntent.aliases) {
      if (alias.includes(" ") || !word.endsWith(alias) || word === alias) {
        continue;
      }

      const prefix = normalizeCompoundPrefix(word.slice(0, -alias.length));
      if (!prefix || prefix.length < 3) {
        continue;
      }

      if (SIGNIFICANT_QUERY_MODIFIER_TERMS.has(prefix)) {
        modifiers.add(prefix);
      }

      for (const root of buildWordRoots(prefix)) {
        if (SIGNIFICANT_QUERY_MODIFIER_TERMS.has(root)) {
          modifiers.add(root);
        }
      }
    }
  }

  return Array.from(modifiers);
}

export function evaluateObjectMatch(
  item: SearchObjectFields,
  objectIntent: DetectedObjectIntent | null,
): ObjectMatchEvaluation {
  if (!objectIntent) {
    return { score: 0, hasMatch: false, hasStrongMatch: false };
  }

  const fields = [
    { value: item.title ?? "", weight: 14, strong: true },
    { value: (item.categories ?? []).join(" "), weight: 10, strong: true },
    { value: (item.aiCategories ?? []).join(" "), weight: 9, strong: true },
    { value: item.description ?? "", weight: 4, strong: false },
  ];

  let score = 0;
  let hasMatch = false;
  let hasStrongMatch = false;

  for (const field of fields) {
    const normalizedValue = normalizeText(field.value);
    if (!normalizedValue) continue;

    const roots = buildNormalizedRoots(normalizedValue);
    if (hasAliasMatch(normalizedValue, roots, objectIntent.aliases)) {
      hasMatch = true;
      score += field.weight;
      if (field.strong) {
        hasStrongMatch = true;
      }
    }
  }

  return { score, hasMatch, hasStrongMatch };
}

export function evaluateModifierMatch(
  item: SearchObjectFields,
  modifierTerms: string[],
): ModifierMatchEvaluation {
  if (!modifierTerms.length) {
    return {
      score: 0,
      matchedTerms: [],
      hasMatch: false,
      hasStrongMatch: false,
    };
  }

  const fields = [
    { value: item.title ?? "", weight: 8, strong: true },
    { value: (item.categories ?? []).join(" "), weight: 6, strong: true },
    { value: (item.aiCategories ?? []).join(" "), weight: 5, strong: true },
    { value: item.description ?? "", weight: 2, strong: false },
  ];

  let score = 0;
  let hasStrongMatch = false;
  const matchedTerms = new Set<string>();

  for (const term of modifierTerms) {
    for (const field of fields) {
      const normalizedValue = normalizeText(field.value);
      if (!normalizedValue) continue;

      const tokens = splitNormalizedTokens(field.value);
      const roots = buildNormalizedRoots(normalizedValue);
      const matched =
        tokens.some(
          (token) =>
            token === term ||
            token.startsWith(term) ||
            buildWordRoots(token).some(
              (root) =>
                root === term ||
                root.startsWith(term) ||
                (term.length >= 4 && root.endsWith(term)),
            ),
        ) ||
        Array.from(roots).some((root) => root === term || root.endsWith(term));

      if (matched) {
        matchedTerms.add(term);
        score += field.weight;
        if (field.strong) {
          hasStrongMatch = true;
        }
        break;
      }
    }
  }

  return {
    score,
    matchedTerms: Array.from(matchedTerms),
    hasMatch: matchedTerms.size > 0,
    hasStrongMatch,
  };
}

export function evaluateCollectionMatch(
  item: SearchObjectFields,
): CollectionMatchEvaluation {
  const fields = [
    { value: item.title ?? "", weight: 16, strong: true },
    { value: (item.categories ?? []).join(" "), weight: 14, strong: true },
    { value: (item.aiCategories ?? []).join(" "), weight: 8, strong: true },
    { value: item.description ?? "", weight: 3, strong: false },
  ];

  let score = 0;
  let hasMatch = false;
  let hasStrongMatch = false;

  for (const field of fields) {
    const tokens = splitNormalizedTokens(field.value);
    if (!tokens.length) continue;

    if (tokens.some((token) => COLLECTION_TERMS.has(token))) {
      hasMatch = true;
      score += field.weight;
      if (field.strong) {
        hasStrongMatch = true;
      }
    }
  }

  return { score, hasMatch, hasStrongMatch };
}

export function shouldRequirePrimaryObjectMatch(
  query: string,
  objectIntent: DetectedObjectIntent | null,
  objectQualifiedCount: number,
) {
  const normalized = normalizeSearchQuery(query);
  const words = normalized.split(" ").filter(Boolean);
  return (
    Boolean(objectIntent) &&
    words.length > 0 &&
    words.length <= 3 &&
    objectQualifiedCount > 0
  );
}

export function shouldRequireModifierMatch(
  query: string,
  modifierTerms: string[],
  modifierQualifiedCount: number,
) {
  const normalized = normalizeSearchQuery(query);
  const words = normalized.split(" ").filter(Boolean);
  return (
    modifierTerms.length > 0 &&
    words.length > 0 &&
    words.length <= 3 &&
    modifierQualifiedCount >= 2
  );
}

export function getObjectAwareScoreBoost(
  objectMatch: ObjectMatchEvaluation,
  concreteQuery: boolean,
) {
  if (objectMatch.hasStrongMatch) {
    return 18 + objectMatch.score * 0.5;
  }

  if (objectMatch.hasMatch) {
    return 9 + objectMatch.score * 0.35;
  }

  return concreteQuery ? -24 : -10;
}

export function getModifierAwareScoreBoost(
  modifierMatch: ModifierMatchEvaluation,
  modifierTerms: string[],
  concreteQuery: boolean,
) {
  if (!modifierTerms.length) {
    return 0;
  }

  if (modifierMatch.hasStrongMatch) {
    return 8 + modifierMatch.score * 0.4;
  }

  if (modifierMatch.hasMatch) {
    return 4 + modifierMatch.score * 0.25;
  }

  return concreteQuery ? -8 : -3;
}

export function getCollectionAwareScorePenalty(
  collectionMatch: CollectionMatchEvaluation,
  concreteQuery: boolean,
  hasSpecificIntent: boolean,
) {
  if (!collectionMatch.hasMatch) {
    return 0;
  }

  if (collectionMatch.hasStrongMatch) {
    return concreteQuery && hasSpecificIntent
      ? -(20 + collectionMatch.score * 0.45)
      : -(8 + collectionMatch.score * 0.2);
  }

  return concreteQuery && hasSpecificIntent
    ? -(10 + collectionMatch.score * 0.25)
    : -(4 + collectionMatch.score * 0.12);
}
