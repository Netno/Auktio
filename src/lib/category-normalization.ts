import { normalizeSearchText } from "@/lib/search-language";

const GENERIC_CATEGORY_TERMS = new Set([
  "alla",
  "all",
  "alle",
  "alles",
  "all categories",
  "allgemein",
  "generelt",
]);

const CATEGORY_RULES: Array<{ category: string; terms: string[] }> = [
  {
    category: "Möbler",
    terms: [
      "mobler",
      "möbler",
      "møbler",
      "mobel",
      "möbel",
      "møbel",
      "mobel",
      "furniture",
      "stol",
      "lænestol",
      "laenestol",
      "slædestol",
      "slaedestol",
      "lufthavnsstol",
      "lufthavnsstole",
      "chaiselong",
      "chaiselong",
      "soffa",
      "bord",
      "skap",
      "skåp",
      "cabinet",
      "table",
      "chair",
      "barstol",
      "barstolar",
      "pall",
      "pallar",
    ],
  },
  {
    category: "Design",
    terms: [
      "design",
      "interior",
      "inredning",
      "mid century",
      "scandinavian design",
      "fremstillet ved",
    ],
  },
  {
    category: "Konst",
    terms: [
      "konst",
      "kunst",
      "art",
      "malning",
      "målning",
      "tavla",
      "grafik",
      "litografi",
      "etsning",
      "akvarell",
      "oljemalning",
      "oljemålning",
      "skulptur",
      "olja",
      "duk",
      "canvas",
      "signerad",
      "signeret",
    ],
  },
  {
    category: "Skulptur",
    terms: [
      "skulptur",
      "figur",
      "figurer",
      "figuriner",
      "figurine",
      "byst",
      "staty",
      "statyett",
    ],
  },
  {
    category: "Fotografi",
    terms: [
      "fotografi",
      "foto",
      "photograph",
      "photo",
      "autograf",
      "portrattfoto",
      "porträttfoto",
      "fotografi",
    ],
  },
  {
    category: "Silver",
    terms: [
      "silver",
      "sølv",
      "sterling",
      "argent",
      "nysilver",
      "sølvbestik",
      "plate",
      "plater",
      "pläter",
      "bestick",
      "slev",
      "gaffel",
      "sked",
      "kniv",
    ],
  },
  {
    category: "Smycken",
    terms: [
      "smycken",
      "smycke",
      "smykker",
      "schmuck",
      "jewellery",
      "jewelry",
      "ring",
      "armband",
      "halsband",
      "brosch",
      "guld",
      "18k",
      "14k",
      "berlock",
      "hange",
      "hänge",
      "parlor",
      "pärlor",
      "orhangen",
      "örhängen",
    ],
  },
  {
    category: "Det dukade bordet",
    terms: [
      "det dukade bordet",
      "tallrik",
      "tallrikar",
      "bestik",
      "fat",
      "skal",
      "skål",
      "servis",
      "service",
      "soppslev",
      "bestick",
      "karaff",
      "ljusstakar",
      "ljusstake",
    ],
  },
  {
    category: "Mattor",
    terms: ["mattor", "matta", "teppe", "teppich", "rug", "carpet"],
  },
  {
    category: "Belysning",
    terms: ["belysning", "lamp", "lampe", "lamper", "pendel", "ljusstake", "lighting"],
  },
  {
    category: "Glas",
    terms: ["glas", "glass", "krystal", "crystal"],
  },
  {
    category: "Porslin",
    terms: [
      "porslin",
      "porcelan",
      "porzellan",
      "porcelain",
      "keramik",
      "ceramic",
      "stengods",
      "servis",
      "vase",
      "fajans",
      "tallrik",
      "tallrikar",
      "fat",
      "skal",
      "skål",
      "ytterfoder",
    ],
  },
  {
    category: "Keramik",
    terms: [
      "keramik",
      "lergods",
      "stengods",
      "biskvi",
      "terracotta",
      "terrakotta",
      "hoganas",
      "höganäs",
    ],
  },
  {
    category: "Klockor",
    terms: ["klockor", "klocka", "ur", "uhren", "uhr", "watch", "clock"],
  },
  {
    category: "Retro",
    terms: ["retro", "vintage", "samlar", "collectible"],
  },
  {
    category: "Böcker",
    terms: ["bocker", "böcker", "bok", "bucher", "bücher", "book", "books"],
  },
  {
    category: "Mynt",
    terms: [
      "mynt",
      "coin",
      "coins",
      "mynthandel",
      "numismatik",
      "medalj",
      "medaljer",
    ],
  },
  {
    category: "Frimärken",
    terms: [
      "frimarke",
      "frimärken",
      "briefmarken",
      "philately",
      "vykort",
      "fdc",
    ],
  },
  {
    category: "Militaria",
    terms: [
      "militaria",
      "uniform",
      "helmet",
      "hjalm",
      "hjälm",
      "bayonett",
      "bajonett",
      "orden",
      "medal",
    ],
  },
  {
    category: "Vapen",
    terms: [
      "vapen",
      "weapon",
      "waffe",
      "waffen",
      "gewehr",
      "flinte",
      "pistole",
      "pistolen",
      "revolver",
      "rifle",
      "shotgun",
      "gun",
      "guns",
      "jagd",
      "holster",
      "munition",
    ],
  },
  {
    category: "Fordon",
    terms: [
      "fordon",
      "bil",
      "bilar",
      "car",
      "cars",
      "vehicle",
      "vehicles",
      "personbil",
      "moped",
      "cykel",
      "motorcykel",
      "peugeot",
      "ecoboost",
      "hdi",
      "reg nr",
      "regnr",
      "årsmodell",
      "arsmodell",
      "chassi",
    ],
  },
  {
    category: "Elektronik",
    terms: [
      "elektronik",
      "ljudkort",
      "audio",
      "stereo",
      "lenovo",
      "tablet",
      "tab",
      "dator",
      "computer",
      "iphone",
      "ipad",
      "headphones",
      "hörlurar",
      "horlurar",
    ],
  },
  {
    category: "Verktyg & Maskiner",
    terms: [
      "verktyg",
      "værktøj",
      "maskin",
      "maskine",
      "maskiner",
      "bordsav",
      "bordsav",
      "sav",
      "såg",
      "kompressor",
      "compressor",
      "robotplæneklipper",
      "robotplaeneklipper",
      "robotgräsklippare",
      "robotgrasklippare",
      "plæneklipper",
      "plaeneklipper",
      "gräsklippare",
      "grasklippare",
      "vaskemaskine",
      "tvättmaskin",
      "tvattmaskin",
    ],
  },
  {
    category: "Musikinstrument",
    terms: [
      "gitarr",
      "munspel",
      "violin",
      "cello",
      "piano",
      "digital piano",
      "klaver",
      "keyboard",
      "flygel",
      "trumma",
      "instrument",
      "musikinstrument",
      "mandolin",
    ],
  },
  {
    category: "Leksaker",
    terms: [
      "leksak",
      "leksaker",
      "modellbil",
      "modellbilar",
      "modelflygplan",
      "modellflygplan",
      "radiostyrd",
      "tintin",
      "lego",
      "docka",
      "samlarfigur",
    ],
  },
  {
    category: "Mode",
    terms: [
      "vintage fashion",
      "fashion",
      "drakt",
      "dräkt",
      "klanning",
      "klänning",
      "jacka",
      "kappa",
      "vaska",
      "väska",
      "skor",
      "hatt",
    ],
  },
  {
    category: "Asiatika",
    terms: [
      "asiatiskt konsthantverk",
      "orientalisk",
      "orientaliska",
      "japan",
      "kina",
      "kinesisk",
      "japansk",
      "asian art",
    ],
  },
];

const STRONG_SINGLE_TERM_CATEGORY_MATCHES = new Set([
  "Belysning",
  "Fordon",
  "Elektronik",
  "Verktyg & Maskiner",
  "Musikinstrument",
  "Leksaker",
  "Möbler",
  "Silver",
]);

function normalizeCategoryValue(value: string | null | undefined) {
  return normalizeSearchText(value ?? "").trim();
}

export function hasOnlyGenericRawCategories(
  rawCategories: string[] | null | undefined,
) {
  const normalizedRawCategories = (rawCategories ?? [])
    .map((category) => normalizeCategoryValue(category))
    .filter(Boolean);

  return (
    normalizedRawCategories.length > 0 &&
    normalizedRawCategories.every((category) => GENERIC_CATEGORY_TERMS.has(category))
  );
}

function buildNormalizedTerms(value: string) {
  const normalized = normalizeCategoryValue(value);
  if (!normalized) {
    return {
      normalized,
      tokenSet: new Set<string>(),
      phraseSet: new Set<string>(),
    };
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const phraseSet = new Set<string>();

  for (let size = 1; size <= Math.min(3, tokens.length); size++) {
    for (let index = 0; index <= tokens.length - size; index++) {
      phraseSet.add(tokens.slice(index, index + size).join(" "));
    }
  }

  return {
    normalized,
    tokenSet: new Set(tokens),
    phraseSet,
  };
}

function countRuleMatches(
  ruleTerms: string[],
  terms: ReturnType<typeof buildNormalizedTerms>,
) {
  let score = 0;

  for (const term of ruleTerms) {
    const normalizedTerm = normalizeCategoryValue(term);
    if (!normalizedTerm) continue;

    if (normalizedTerm.includes(" ")) {
      if (terms.phraseSet.has(normalizedTerm)) {
        score += 1;
      }
      continue;
    }

    if (terms.tokenSet.has(normalizedTerm)) {
      score += 1;
    }
  }

  return score;
}

function getCategoryScores(terms: ReturnType<typeof buildNormalizedTerms>) {
  return CATEGORY_RULES.map((rule) => ({
    category: rule.category,
    score: countRuleMatches(rule.terms, terms),
  })).filter((rule) => rule.score > 0);
}

function getTopScoringCategories(
  scores: Array<{ category: string; score: number }>,
  minScore: number,
) {
  const maxScore = scores.reduce(
    (currentMax, rule) => Math.max(currentMax, rule.score),
    0,
  );

  if (maxScore < minScore) {
    return [];
  }

  return scores
    .filter((rule) => rule.score === maxScore)
    .map((rule) => rule.category);
}

function getStrongSingleTermCategories(
  scores: Array<{ category: string; score: number }>,
) {
  return scores
    .filter(
      (rule) =>
        rule.score === 1 && STRONG_SINGLE_TERM_CATEGORY_MATCHES.has(rule.category),
    )
    .map((rule) => rule.category);
}

function reconcileCategories(
  categories: string[],
  textScores: Array<{ category: string; score: number }>,
) {
  const resolved = new Set(categories);

  if (resolved.has("Diverse") && resolved.size > 1) {
    resolved.delete("Diverse");
  }

  const textScoreMap = new Map(
    textScores.map((rule) => [rule.category, rule.score]),
  );

  if (resolved.has("Mynt") && resolved.has("Frimärken")) {
    const myntScore = textScoreMap.get("Mynt") ?? 0;
    const stampScore = textScoreMap.get("Frimärken") ?? 0;
    if (myntScore > stampScore) {
      resolved.delete("Frimärken");
    } else if (stampScore > myntScore) {
      resolved.delete("Mynt");
    }
  }

  if (
    resolved.has("Smycken") &&
    resolved.has("Silver") &&
    (textScoreMap.get("Smycken") ?? 0) > (textScoreMap.get("Silver") ?? 0)
  ) {
    resolved.delete("Silver");
  }

  if (resolved.has("Porslin") && resolved.has("Keramik")) {
    const porslinScore = textScoreMap.get("Porslin") ?? 0;
    const keramikScore = textScoreMap.get("Keramik") ?? 0;
    if (porslinScore > keramikScore) {
      resolved.delete("Keramik");
    } else if (keramikScore > porslinScore) {
      resolved.delete("Porslin");
    }
  }

  if (resolved.has("Fordon") && resolved.has("Elektronik")) {
    const fordonScore = textScoreMap.get("Fordon") ?? 0;
    const elektronikScore = textScoreMap.get("Elektronik") ?? 0;
    if (elektronikScore >= fordonScore) {
      resolved.delete("Fordon");
    }
  }

  if (resolved.has("Fordon") && resolved.has("Leksaker")) {
    const fordonScore = textScoreMap.get("Fordon") ?? 0;
    const leksakerScore = textScoreMap.get("Leksaker") ?? 0;
    if (leksakerScore >= fordonScore) {
      resolved.delete("Fordon");
    }
  }

  return Array.from(resolved);
}

export function normalizeLotCategories(params: {
  rawCategories: string[] | null | undefined;
  title: string | null | undefined;
  description: string | null | undefined;
}): string[] {
  const { rawCategories, title, description } = params;

  const normalizedRawCategories = (rawCategories ?? [])
    .map((category) => normalizeCategoryValue(category))
    .filter((category) => category && !GENERIC_CATEGORY_TERMS.has(category));

  const rawCategoryTerms = buildNormalizedTerms(
    normalizedRawCategories.join(" "),
  );
  const textTerms = buildNormalizedTerms(
    [normalizeCategoryValue(title), normalizeCategoryValue(description)]
      .filter(Boolean)
      .join(" "),
  );

  const rawCategoryScores = getCategoryScores(rawCategoryTerms);
  const textScores = getCategoryScores(textTerms);
  const topRawMatches = getTopScoringCategories(rawCategoryScores, 1);

  if (topRawMatches.length > 0) {
    const narrowedRawMatches =
      topRawMatches.length > 1
        ? topRawMatches.filter(
            (category) =>
              (textScores.find((rule) => rule.category === category)?.score ??
                0) > 0,
          )
        : topRawMatches;

    const resolvedRawMatches = reconcileCategories(
      narrowedRawMatches.length > 0 ? narrowedRawMatches : topRawMatches,
      textScores,
    );

    if (resolvedRawMatches.length > 0) {
      return resolvedRawMatches;
    }
  }

  const categories = new Set(getTopScoringCategories(textScores, 2));

  if (categories.size === 0 && normalizedRawCategories.length === 0) {
    for (const category of getStrongSingleTermCategories(textScores)) {
      categories.add(category);
    }
  }

  if (categories.size === 0 && normalizedRawCategories.length > 0) {
    for (const category of getStrongSingleTermCategories(textScores)) {
      categories.add(category);
    }
  }

  if (categories.size === 0 && normalizedRawCategories.length > 0) {
    categories.add("Diverse");
  }

  return reconcileCategories(Array.from(categories), textScores);
}
