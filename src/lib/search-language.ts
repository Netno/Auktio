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
  silersked: "silver sked",
  silversked: "silver sked",
  silverskedar: "silver sked",
  silverskeden: "silver sked",
  silverskedarna: "silver sked",
  silverfargad: "silver",
  silverfargade: "silver",
  silverfärgad: "silver",
  silverfärgade: "silver",
  skedar: "sked",
  skeden: "sked",
  guldig: "guld",
  guldiga: "guld",
  guldsked: "guld sked",
  guldskedar: "guld sked",
  guldfargad: "guld",
  guldfärgade: "guld",
};

const SWEDISH_SEMANTIC_QUERY_EXPANSIONS: Record<string, string[]> = {
  djur: [
    "animal",
    "fauna",
    "leopard",
    "lejon",
    "tiger",
    "panter",
    "jaguar",
    "lodjur",
    "hund",
    "katt",
    "häst",
    "fågel",
    "fisk",
  ],
  kattdjur: ["leopard", "lejon", "tiger", "panter", "jaguar", "lodjur"],
  katt: ["kattdjur", "leopard", "lejon", "tiger", "panter", "lodjur"],
  fågel: ["bird", "örn", "uggla", "svan"],
  fisk: ["fish", "marin", "akvatisk"],
  häst: ["ponny", "ryttare", "equine"],
  hund: ["jakthund", "valp", "dog"],
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

export function expandSwedishSemanticQueryTerms(query: string): string[] {
  const baseTerms = extractSwedishQueryTerms(query);
  const expandedTerms = new Set<string>(baseTerms);

  for (const term of baseTerms) {
    const semanticTerms = SWEDISH_SEMANTIC_QUERY_EXPANSIONS[term] ?? [];
    for (const semanticTerm of semanticTerms) {
      const normalizedTerm = normalizeSearchText(semanticTerm);
      if (!normalizedTerm) continue;

      expandedTerms.add(normalizedTerm);
      for (const token of normalizedTerm.split(" ").filter(Boolean)) {
        if (token.length >= 3) {
          expandedTerms.add(token);
        }
      }
    }
  }

  return Array.from(expandedTerms);
}
