import { CATEGORY_ORDER, FEED_SOURCES } from "@/config/sources";
import {
  canonicalizeSwedishQueryWord,
  normalizeSearchText,
} from "./search-language";

const STOP_WORDS = new Set([
  "och",
  "med",
  "för",
  "från",
  "hos",
  "på",
  "av",
  "i",
  "om",
  "att",
  "en",
  "ett",
  "den",
  "det",
  "de",
]);

const COMMON_SEARCH_TERMS = [
  "antik",
  "antikviteter",
  "arabia",
  "armbandsur",
  "bestick",
  "bing",
  "bord",
  "boda",
  "byrå",
  "design",
  "djur",
  "djurmotiv",
  "fickur",
  "fågel",
  "gammal",
  "glas",
  "gustavsberg",
  "guld",
  "hund",
  "katt",
  "keramik",
  "klocka",
  "konst",
  "kosta",
  "lampa",
  "leopard",
  "målning",
  "målningar",
  "matta",
  "mattor",
  "möbler",
  "mynt",
  "orrefors",
  "olja",
  "oljemålning",
  "porslin",
  "retro",
  "rorstrand",
  "rörstrand",
  "royal",
  "copenhagen",
  "servis",
  "silver",
  "skål",
  "skåp",
  "soffa",
  "spegel",
  "stol",
  "smycken",
  "tavla",
  "tavlor",
  "urna",
  "vas",
];

const TYPO_CORRECTIONS: Record<string, string> = {
  rostrand: "rörstrand",
  rostrnad: "rörstrand",
  röstrand: "rörstrand",
  röstrnad: "rörstrand",
  rorstarnd: "rörstrand",
  rorstrnad: "rörstrand",
  gustavsber: "gustavsberg",
  orrefor: "orrefors",
  kostabod: "kosta boda",
  kostaboda: "kosta boda",
};

const KNOWN_SEARCH_TERMS = buildKnownSearchTerms();

function buildKnownSearchTerms() {
  const terms = new Set<string>();

  for (const category of CATEGORY_ORDER) {
    for (const token of normalizeSearchText(category)
      .split(" ")
      .filter(Boolean)) {
      terms.add(canonicalizeSwedishQueryWord(token));
      terms.add(token);
    }
  }

  for (const source of FEED_SOURCES) {
    const values = [source.name, source.id.replace(/-/g, " ")];

    for (const value of values) {
      for (const token of normalizeSearchText(value)
        .split(" ")
        .filter(Boolean)) {
        if (token.length >= 3) {
          terms.add(canonicalizeSwedishQueryWord(token));
          terms.add(token);
        }
      }
    }
  }

  for (const term of COMMON_SEARCH_TERMS) {
    terms.add(canonicalizeSwedishQueryWord(normalizeSearchText(term)));
    terms.add(normalizeSearchText(term));
  }

  return Array.from(terms).filter((term) => term.length >= 3);
}

function getDistanceLimit(token: string) {
  if (token.length <= 5) return 1;
  if (token.length <= 8) return 2;
  return 3;
}

function getLevenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);

  for (let column = 1; column <= right.length; column += 1) {
    let previousDiagonal = rows[0];
    rows[0] = column;

    for (let row = 1; row <= left.length; row += 1) {
      const previousRow = rows[row];
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      rows[row] = Math.min(
        rows[row] + 1,
        rows[row - 1] + 1,
        previousDiagonal + substitutionCost,
      );

      previousDiagonal = previousRow;
    }
  }

  return rows[left.length];
}

function getCorrectedToken(token: string) {
  const directCorrection = TYPO_CORRECTIONS[token];
  if (directCorrection) {
    return directCorrection;
  }

  if (
    token.length < 4 ||
    STOP_WORDS.has(token) ||
    KNOWN_SEARCH_TERMS.includes(token)
  ) {
    return token;
  }

  let bestMatch: { term: string; distance: number } | null = null;

  for (const candidate of KNOWN_SEARCH_TERMS) {
    if (candidate[0] !== token[0]) {
      continue;
    }

    if (Math.abs(candidate.length - token.length) > 2) {
      continue;
    }

    const distance = getLevenshteinDistance(token, candidate);
    if (distance === 0 || distance > getDistanceLimit(token)) {
      continue;
    }

    if (
      !bestMatch ||
      distance < bestMatch.distance ||
      (distance === bestMatch.distance &&
        candidate.length < bestMatch.term.length)
    ) {
      bestMatch = { term: candidate, distance };
    }
  }

  return bestMatch?.term ?? token;
}

export function getDidYouMeanQuery(query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return null;
  }

  const correctedTokens = normalizedQuery
    .split(" ")
    .filter(Boolean)
    .map((token) => getCorrectedToken(canonicalizeSwedishQueryWord(token)));

  const correctedQuery = correctedTokens.join(" ").trim();

  return correctedQuery && correctedQuery !== normalizedQuery
    ? correctedQuery
    : null;
}
