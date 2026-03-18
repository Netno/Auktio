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
      "mobel",
      "möbel",
      "mobel",
      "furniture",
      "stol",
      "soffa",
      "bord",
      "skap",
      "skåp",
      "cabinet",
      "table",
      "chair",
    ],
  },
  {
    category: "Design",
    terms: ["design", "interior", "inredning", "mid century", "scandinavian design"],
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
    ],
  },
  {
    category: "Silver",
    terms: ["silver", "sterling", "argent"],
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
      "orhangen",
      "örhängen",
    ],
  },
  {
    category: "Mattor",
    terms: ["mattor", "matta", "teppe", "teppich", "rug", "carpet"],
  },
  {
    category: "Belysning",
    terms: ["belysning", "lamp", "lampe", "lamper", "ljusstake", "lighting"],
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
      "fajans",
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
    terms: ["mynt", "coin", "coins", "mynthandel", "numismatik", "medalj", "medaljer"],
  },
  {
    category: "Frimärken",
    terms: ["frimarke", "frimärken", "frimarke", "briefmarken", "stamp", "stamps", "philately"],
  },
  {
    category: "Militaria",
    terms: ["militaria", "uniform", "helmet", "hjalm", "hjälm", "bayonett", "bajonett", "orden", "medal"] ,
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
    terms: ["fordon", "bil", "bilar", "car", "cars", "vehicle", "vehicles", "motorcykel", "traktor"],
  },
];

function normalizeCategoryValue(value: string | null | undefined) {
  return normalizeSearchText(value ?? "").trim();
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

  const sourceText = [
    ...normalizedRawCategories,
    normalizeCategoryValue(title),
    normalizeCategoryValue(description),
  ]
    .filter(Boolean)
    .join(" | ");

  const categories = new Set<string>();

  for (const rule of CATEGORY_RULES) {
    if (rule.terms.some((term) => sourceText.includes(term))) {
      categories.add(rule.category);
    }
  }

  if (categories.size === 0 && normalizedRawCategories.length > 0) {
    categories.add("Diverse");
  }

  return Array.from(categories);
}