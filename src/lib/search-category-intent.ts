import { CATEGORY_ORDER, type KnownCategory } from "@/config/sources";
import { normalizeSwedishSearchQuery as normalizeSearchQuery } from "@/lib/search-language";

const CATEGORY_ALIASES: Record<KnownCategory, string[]> = {
  Möbler: ["möbler", "mobler", "möbel", "mobel", "furniture"],
  Design: ["design"],
  Konst: ["konst", "kunst", "art"],
  Skulptur: ["skulptur", "skulpturer", "figuriner", "figurer"],
  Fotografi: ["fotografi", "foto", "foton"],
  Silver: ["silver", "nysilver"],
  Smycken: ["smycken", "smycke", "guld"],
  "Det dukade bordet": ["det dukade bordet", "dukade bordet", "bordsdukning"],
  "Hem & Hushåll": [
    "hem och hushall",
    "hem & hushall",
    "hem och hushåll",
    "hem & hushåll",
    "hushall",
    "hushåll",
    "kok",
    "kök",
    "pepparkvarn",
    "saltkvarn",
  ],
  Mattor: ["mattor", "matta"],
  Belysning: ["belysning", "lampor", "lampa"],
  Glas: ["glas"],
  Porslin: ["porslin"],
  Keramik: ["keramik", "stengods", "lergods"],
  Klockor: [
    "klockor",
    "klocka",
    "ur",
    "armbandsur",
    "herrarmbandsur",
    "damarmbandsur",
    "fickur",
  ],
  Mynt: ["mynt", "medalj", "medaljer", "numismatik"],
  Frimärken: ["frimärken", "frimarke", "frimarken", "vykort", "fdc"],
  Militaria: ["militaria", "militärt", "militart"],
  Vapen: ["vapen", "gevär", "gevar", "pistol", "svärd", "svard"],
  Fordon: ["fordon", "bil", "bilar", "motorcykel", "motorcyklar"],
  Elektronik: [
    "elektronik",
    "audio",
    "ljudkort",
    "surfplatta",
    "tablet",
    "dator",
  ],
  "Verktyg & Maskiner": [
    "verktyg",
    "maskiner",
    "maskin",
    "kompressor",
    "såg",
    "sav",
  ],
  Musikinstrument: ["musikinstrument", "instrument", "gitarr", "munspel"],
  Leksaker: [
    "leksaker",
    "leksak",
    "modellbil",
    "modellbilar",
    "modelflygplan",
    "radiostyrd",
  ],
  Mode: ["mode", "fashion", "kläder", "klader"],
  Asiatika: ["asiatika", "asiatiskt", "asiatiska"],
  Retro: ["retro", "vintage"],
  Böcker: ["böcker", "bocker", "bok"],
  Diverse: ["diverse", "övrigt", "ovrigt"],
};

const NORMALIZED_CATEGORY_TO_CANONICAL = new Map<string, KnownCategory>();
const CATEGORY_MATCHERS = CATEGORY_ORDER.map((category) => ({
  category,
  aliases: Array.from(
    new Set(
      [category, ...(CATEGORY_ALIASES[category] ?? [category])]
        .map((alias) => normalizeSearchQuery(alias))
        .filter(Boolean),
    ),
  ).sort((a, b) => b.length - a.length),
}));

for (const category of CATEGORY_ORDER) {
  const aliases = CATEGORY_ALIASES[category] ?? [category];

  for (const alias of [category, ...aliases]) {
    const normalized = normalizeSearchQuery(alias);
    if (normalized) {
      NORMALIZED_CATEGORY_TO_CANONICAL.set(normalized, category);
    }
  }
}

export function detectCategoryIntent(query: string | null | undefined) {
  const normalized = normalizeSearchQuery(query ?? "");
  if (!normalized) {
    return null;
  }

  const exactMatch = NORMALIZED_CATEGORY_TO_CANONICAL.get(normalized);
  if (exactMatch) {
    return exactMatch;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  let bestMatch: { category: KnownCategory; alias: string } | null = null;

  for (const matcher of CATEGORY_MATCHERS) {
    for (const alias of matcher.aliases) {
      const matched = alias.includes(" ")
        ? normalized.includes(alias)
        : tokens.some(
            (token) =>
              token === alias ||
              (alias.length >= 4 &&
                token.length > alias.length &&
                token.endsWith(alias)),
          );

      if (!matched) {
        continue;
      }

      if (!bestMatch || alias.length > bestMatch.alias.length) {
        bestMatch = { category: matcher.category, alias };
      }
    }
  }

  return bestMatch?.category ?? null;
}
