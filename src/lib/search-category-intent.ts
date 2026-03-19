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
  Mattor: ["mattor", "matta"],
  Belysning: ["belysning", "lampor", "lampa"],
  Glas: ["glas"],
  Porslin: ["porslin"],
  Keramik: ["keramik", "stengods", "lergods"],
  Klockor: ["klockor", "klocka", "ur"],
  Mynt: ["mynt", "medalj", "medaljer", "numismatik"],
  Frimärken: ["frimärken", "frimarke", "frimarken", "vykort", "fdc"],
  Militaria: ["militaria", "militärt", "militart"],
  Vapen: ["vapen", "gevär", "gevar", "pistol", "svärd", "svard"],
  Fordon: ["fordon", "bil", "bilar", "motorcykel", "motorcyklar"],
  Elektronik: ["elektronik", "audio", "ljudkort", "surfplatta", "tablet", "dator"],
  "Verktyg & Maskiner": ["verktyg", "maskiner", "maskin", "kompressor", "såg", "sav"],
  Musikinstrument: ["musikinstrument", "instrument", "gitarr", "munspel"],
  Leksaker: ["leksaker", "leksak", "modellbil", "modellbilar", "modelflygplan", "radiostyrd"],
  Mode: ["mode", "fashion", "kläder", "klader"],
  Asiatika: ["asiatika", "asiatiskt", "asiatiska"],
  Retro: ["retro", "vintage"],
  Böcker: ["böcker", "bocker", "bok"],
  Diverse: ["diverse", "övrigt", "ovrigt"],
};

const NORMALIZED_CATEGORY_TO_CANONICAL = new Map<string, KnownCategory>();

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

  return NORMALIZED_CATEGORY_TO_CANONICAL.get(normalized) ?? null;
}