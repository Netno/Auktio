const SWEDISH_QUERY_STOP_WORDS = new Set([
  "och",
  "att",
  "det",
  "den",
  "detta",
  "dessa",
  "som",
  "med",
  "utan",
  "för",
  "från",
  "hos",
  "på",
  "av",
  "i",
  "om",
  "är",
  "var",
  "kan",
  "finns",
  "finnes",
  "någon",
  "några",
  "just",
  "nu",
  "snart",
  "slutar",
  "visa",
  "letar",
  "efter",
  "har",
  "jag",
  "ni",
  "ute",
  "under",
  "över",
  "eller",
  "till",
  "ca",
  "sak",
  "saker",
  "grej",
  "grejer",
  "ting",
  "snygg",
  "snygga",
]);

const SWEDISH_CANONICAL_QUERY_TERMS: Record<string, string> = {
  silvrig: "silver",
  silvriga: "silver",
  silverfargad: "silver",
  silverfargade: "silver",
  silverfärgad: "silver",
  silverfärgade: "silver",
  guldig: "guld",
  guldiga: "guld",
  guldfargad: "guld",
  guldfärgade: "guld",
};

const SWEDISH_COMPOUND_PREFIXES = [
  "silver",
  "guld",
  "glas",
  "keramik",
  "porslin",
  "bord",
  "stol",
  "sked",
  "skedar",
  "gaffel",
  "gafflar",
  "kniv",
  "knivar",
];

const SWEDISH_SUFFIXES = [
  "orna",
  "arna",
  "erna",
  "ande",
  "heten",
  "elser",
  "or",
  "ar",
  "er",
  "na",
  "en",
  "et",
  "an",
  "n",
  "a",
  "e",
  "r",
  "t",
];

export function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/["'.,!?():;/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeSwedishQueryWord(word: string): string {
  return SWEDISH_CANONICAL_QUERY_TERMS[word] ?? word;
}

export function normalizeSwedishSearchQuery(query: string): string {
  return normalizeSearchText(query)
    .split(" ")
    .map((word) => canonicalizeSwedishQueryWord(word))
    .filter((word) => word.length >= 2 && !SWEDISH_QUERY_STOP_WORDS.has(word))
    .join(" ")
    .trim();
}

export function buildSwedishWordRoots(word: string): string[] {
  const roots = new Set<string>([word]);

  for (const prefix of SWEDISH_COMPOUND_PREFIXES) {
    if (word.startsWith(prefix) && word.length - prefix.length >= 3) {
      roots.add(prefix);
      roots.add(word.slice(prefix.length));
    }
  }

  for (const root of Array.from(roots)) {
    for (const suffix of SWEDISH_SUFFIXES) {
      if (root.endsWith(suffix) && root.length - suffix.length >= 3) {
        roots.add(root.slice(0, -suffix.length));
      }
    }
  }

  return Array.from(roots).filter((root) => root.length >= 3);
}

export function extractSwedishQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      normalizeSwedishSearchQuery(query)
        .split(" ")
        .filter((word) => word.length >= 3)
        .flatMap((word) =>
          buildSwedishWordRoots(canonicalizeSwedishQueryWord(word)),
        ),
    ),
  );
}
