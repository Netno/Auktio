import { FEED_SOURCES } from "@/config/sources";
import { extractGeminiUsageMetadata, logAiUsage } from "@/lib/ai-usage-log";
import {
  normalizeSearchText as normalizeText,
  normalizeSwedishSearchQuery as normalizeSearchQuery,
} from "@/lib/search-language";

const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const SEARCH_INTENT_CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_INTENT_FETCH_TIMEOUT_MS = 2500;
const SEARCH_INTENT_CACHE_MAX_ENTRIES = 200;
const aiIntentCache = new Map<
  string,
  { expiresAt: number; value: SearchIntent }
>();

const RETRIEVAL_NOISE_TERMS = new Set([
  "alla",
  "visa",
  "föremål",
  "foremal",
  "objekt",
  "auktion",
  "auktioner",
  "auktionshus",
  "auktionsbyra",
  "auktionsbyrå",
  "slutar",
  "slut",
  "slutpris",
  "såld",
  "sålda",
  "avslutas",
  "avslutade",
  "avslutad",
  "avslutats",
  "klubbat",
  "klubbad",
  "idag",
  "imorgon",
  "ikvall",
  "ikväll",
  "kvall",
  "kväll",
  "snart",
  "denna",
  "vecka",
]);

const BROAD_BROWSE_TERMS = [
  "fynd",
  "prisvard",
  "prisvärd",
  "billig",
  "billigt",
  "billiga",
  "rekommendera",
  "tips",
  "intressant",
  "intressanta",
  "visa",
  "bra",
  "sammanfatta",
  "jamfor",
  "jämför",
];

const ENDED_QUERY_PATTERN =
  /\b(slutpris|såld|sålda|avslutad|avslutade|avslutats|klubbat|klubbad)\b/u;

export interface DetectedAuctionHouseIntent {
  id: string;
  name: string;
  aliases: string[];
}

export interface SearchIntent {
  normalizedRawQuery: string;
  normalizedQuery: string;
  queryWithoutHouse: string;
  retrievalQuery: string;
  matchedAuctionHouse: DetectedAuctionHouseIntent | null;
  includeEnded: boolean;
  endTimeFrom?: string;
  endTimeTo?: string;
  prefersBrowse: boolean;
  action: "show" | "recommend" | "compare" | "summarize" | "unknown";
  scope: "all" | "filtered" | "unknown";
  entity: "lots" | "auctions" | "unknown";
  intentSource: "heuristic" | "heuristic+ai" | "cache";
  aiEnhanced: boolean;
}

type AiSearchIntentResponse = {
  action?: "show" | "recommend" | "compare" | "summarize" | "unknown";
  scope?: "all" | "filtered" | "unknown";
  entity?: "lots" | "auctions" | "unknown";
  retrievalQuery?: string;
  prefersBrowse?: boolean;
  includeEnded?: boolean;
  timeWindow?: "none" | "today" | "tomorrow" | "tonight" | "soon" | "week";
};

const HOUSE_MATCHERS: DetectedAuctionHouseIntent[] = FEED_SOURCES.map(
  (source) => {
    const aliases = new Set<string>();
    const normalizedName = normalizeText(source.name);
    const normalizedId = normalizeText(source.id.replace(/-/g, " "));

    const stripAuctionHouseSuffix = (value: string) =>
      value
        .replace(
          /\s+(?:auktioner?|auktionshus|auktionsbyra|auktionsbyrå)$/u,
          "",
        )
        .trim();

    const nameWithoutSuffix = stripAuctionHouseSuffix(normalizedName);
    const idWithoutSuffix = stripAuctionHouseSuffix(normalizedId);

    aliases.add(normalizedName);
    aliases.add(normalizedId);

    if (nameWithoutSuffix.length >= 3) {
      aliases.add(nameWithoutSuffix);
    }

    if (idWithoutSuffix.length >= 3) {
      aliases.add(idWithoutSuffix);
    }

    const firstToken = nameWithoutSuffix.split(" ")[0];
    if (firstToken && firstToken.length >= 4) {
      aliases.add(firstToken);
    }

    const firstIdToken = idWithoutSuffix.split(" ")[0];
    if (firstIdToken && firstIdToken.length >= 4) {
      aliases.add(firstIdToken);
    }

    return {
      id: source.id,
      name: source.name,
      aliases: Array.from(aliases).sort((a, b) => b.length - a.length),
    };
  },
);

function canonicalizeNaturalLanguageQuery(query: string) {
  return query
    .replace(/\bi\s+dag\b/giu, "idag")
    .replace(/\bi\s+morgon\b/giu, "imorgon")
    .replace(/\bimorrn\b/giu, "imorgon")
    .replace(/\bi\s+kväll\b/giu, "ikväll")
    .replace(/\bi\s+kvall\b/giu, "ikväll");
}

function getNormalizedRawQuery(query: string) {
  return normalizeText(canonicalizeNaturalLanguageQuery(query));
}

function getNormalizedQuery(query: string) {
  return normalizeSearchQuery(canonicalizeNaturalLanguageQuery(query));
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return asUtc - date.getTime();
}

function getStockholmDayRange(dayOffset: number) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = formatter
    .format(now)
    .split("-")
    .map((value) => Number(value));

  const stockholmMidnightUtc = new Date(
    Date.UTC(year, month - 1, day + dayOffset, 0, 0, 0, 0),
  );
  const startOffset = getTimeZoneOffsetMs(
    stockholmMidnightUtc,
    "Europe/Stockholm",
  );
  const start = new Date(stockholmMidnightUtc.getTime() - startOffset);

  const stockholmNextMidnightUtc = new Date(
    Date.UTC(year, month - 1, day + dayOffset + 1, 0, 0, 0, 0),
  );
  const endOffset = getTimeZoneOffsetMs(
    stockholmNextMidnightUtc,
    "Europe/Stockholm",
  );
  const end = new Date(stockholmNextMidnightUtc.getTime() - endOffset);

  return { start, end };
}

function detectAuctionHouseMatch(normalizedRawQuery: string) {
  const paddedQuery = ` ${normalizedRawQuery} `;

  for (const house of HOUSE_MATCHERS) {
    const matchedAlias = house.aliases.find((alias) =>
      paddedQuery.includes(` ${alias} `),
    );

    if (matchedAlias) {
      return { house, matchedAlias };
    }
  }

  return null;
}

function detectAction(normalizedRawQuery: string) {
  if (/\b(rekommendera|tips)\b/u.test(normalizedRawQuery)) {
    return "recommend" as const;
  }

  if (/\b(jämför|jamfor)\b/u.test(normalizedRawQuery)) {
    return "compare" as const;
  }

  if (/\b(sammanfatta)\b/u.test(normalizedRawQuery)) {
    return "summarize" as const;
  }

  if (
    /\b(visa|visa mig|vilka|vilken|vilket|hitta|sök|soker|letar)\b/u.test(
      normalizedRawQuery,
    )
  ) {
    return "show" as const;
  }

  return "unknown" as const;
}

function detectScope(normalizedRawQuery: string) {
  if (/\b(alla|samtliga)\b/u.test(normalizedRawQuery)) {
    return "all" as const;
  }

  if (normalizedRawQuery.length > 0) {
    return "filtered" as const;
  }

  return "unknown" as const;
}

function detectEntity(normalizedRawQuery: string) {
  if (/\b(auktion|auktioner)\b/u.test(normalizedRawQuery)) {
    return "auctions" as const;
  }

  if (
    /\b(föremål|foremal|objekt|sak|saker|lot|lots)\b/u.test(normalizedRawQuery)
  ) {
    return "lots" as const;
  }

  return "unknown" as const;
}

function stripAuctionHouseTerms(
  normalizedQuery: string,
  house: DetectedAuctionHouseIntent | null,
) {
  if (!house) {
    return normalizedQuery;
  }

  const aliasTokens = new Set(
    house.aliases
      .flatMap((alias) => alias.split(" "))
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );

  return normalizedQuery
    .split(" ")
    .filter((token) => token && !aliasTokens.has(token))
    .join(" ")
    .trim();
}

function stripRetrievalNoiseTerms(normalizedQuery: string) {
  return normalizedQuery
    .split(" ")
    .filter((token) => token && !RETRIEVAL_NOISE_TERMS.has(token))
    .join(" ")
    .trim();
}

function applyTimeWindowToIntent(
  intent: SearchIntent,
  timeWindow: NonNullable<AiSearchIntentResponse["timeWindow"]>,
) {
  if (timeWindow === "none") {
    return;
  }

  if (timeWindow === "today") {
    const range = getStockholmDayRange(0);
    intent.endTimeFrom = range.start.toISOString();
    intent.endTimeTo = range.end.toISOString();
    intent.prefersBrowse = true;
    return;
  }

  if (timeWindow === "tomorrow") {
    const range = getStockholmDayRange(1);
    intent.endTimeFrom = range.start.toISOString();
    intent.endTimeTo = range.end.toISOString();
    intent.prefersBrowse = true;
    return;
  }

  if (timeWindow === "tonight") {
    const range = getStockholmDayRange(0);
    intent.endTimeFrom = new Date().toISOString();
    intent.endTimeTo = range.end.toISOString();
    intent.prefersBrowse = true;
    return;
  }

  if (timeWindow === "soon") {
    intent.endTimeFrom = new Date().toISOString();
    intent.endTimeTo = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    intent.prefersBrowse = true;
    return;
  }

  if (timeWindow === "week") {
    intent.endTimeFrom = new Date().toISOString();
    intent.endTimeTo = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    intent.prefersBrowse = true;
  }
}

function sanitizeRetrievalQuery(
  query: string,
  house: DetectedAuctionHouseIntent | null,
) {
  const normalized = stripAuctionHouseTerms(getNormalizedQuery(query), house);
  return stripRetrievalNoiseTerms(normalized);
}

function shouldUseAiIntentParser(query: string, intent: SearchIntent) {
  if (!process.env.GEMINI_API_KEY) {
    return false;
  }

  const tokenCount = intent.normalizedRawQuery
    .split(" ")
    .filter(Boolean).length;
  if (tokenCount < 4) {
    return false;
  }

  return (
    intent.prefersBrowse ||
    intent.retrievalQuery.length === 0 ||
    /\b(visa|visa mig|vilka|vilken|vilket|ge mig|jag vill|letar|finns|hos|alla|föremål|foremal|objekt)\b/u.test(
      intent.normalizedRawQuery,
    ) ||
    query.includes("?")
  );
}

function stripJsonFences(payload: string) {
  return payload
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function pruneAiIntentCache(now: number) {
  for (const [key, entry] of aiIntentCache.entries()) {
    if (entry.expiresAt <= now) {
      aiIntentCache.delete(key);
    }
  }

  while (aiIntentCache.size > SEARCH_INTENT_CACHE_MAX_ENTRIES) {
    const oldestKey = aiIntentCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    aiIntentCache.delete(oldestKey);
  }
}

async function parseSearchIntentWithAi(
  query: string,
  heuristicIntent: SearchIntent,
): Promise<AiSearchIntentResponse | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const startedAt = Date.now();
  let response: Response;

  try {
    response = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(SEARCH_INTENT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Fråga: ${query}\nHeuristiskt auktionshus: ${heuristicIntent.matchedAuctionHouse?.name ?? "none"}\nHeuristisk retrievalQuery: ${heuristicIntent.retrievalQuery || "none"}\nReturnera ENDAST JSON med fälten {\"action\",\"scope\",\"entity\",\"retrievalQuery\",\"prefersBrowse\",\"includeEnded\",\"timeWindow\"}.\nTillåtna värden:\n- action: show | recommend | compare | summarize | unknown\n- scope: all | filtered | unknown\n- entity: lots | auctions | unknown\n- timeWindow: none | today | tomorrow | tonight | soon | week\nRegler:\n- Lämna retrievalQuery tom om frågan bara uttrycker hus, tidsfönster eller generiska ord som föremål, objekt, auktionshus\n- Tolka naturligt språk, inte bara nyckelord\n- Svara med strikt JSON utan förklaringar`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 180,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (error) {
    await logAiUsage({
      provider: "google",
      model: "gemini-2.0-flash",
      operation: "search-intent-parse",
      status: "error",
      latencyMs: Date.now() - startedAt,
      errorMessage:
        error instanceof Error ? error.message : "Search intent fetch failed",
      itemCount: 1,
      metadata: { query },
    });
    return null;
  }

  if (!response.ok) {
    const err = await response.text();
    await logAiUsage({
      provider: "google",
      model: "gemini-2.0-flash",
      operation: "search-intent-parse",
      status: "error",
      latencyMs: Date.now() - startedAt,
      errorMessage: `Gemini search intent error ${response.status}: ${err}`,
      itemCount: 1,
      metadata: { query },
    });
    return null;
  }

  const data = await response.json();
  const usage = extractGeminiUsageMetadata(data);
  const rawText =
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    data.candidates?.[0]?.content?.parts?.find(
      (part: { text?: string }) => typeof part.text === "string",
    )?.text ??
    "";

  try {
    const parsed = JSON.parse(
      stripJsonFences(rawText),
    ) as AiSearchIntentResponse;
    await logAiUsage({
      provider: "google",
      model: "gemini-2.0-flash",
      operation: "search-intent-parse",
      status: "success",
      latencyMs: Date.now() - startedAt,
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      totalTokens: usage.totalTokenCount,
      tokenMetricsReported: usage.tokenMetricsReported,
      itemCount: 1,
      metadata: {
        query,
        heuristicRetrievalQuery: heuristicIntent.retrievalQuery,
      },
    });
    return parsed;
  } catch (error) {
    await logAiUsage({
      provider: "google",
      model: "gemini-2.0-flash",
      operation: "search-intent-parse",
      status: "error",
      latencyMs: Date.now() - startedAt,
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      totalTokens: usage.totalTokenCount,
      tokenMetricsReported: usage.tokenMetricsReported,
      itemCount: 1,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to parse AI intent JSON",
      metadata: { query, rawText },
    });
    return null;
  }
}

function mergeAiIntent(
  heuristicIntent: SearchIntent,
  aiIntent: AiSearchIntentResponse,
): SearchIntent {
  const merged: SearchIntent = {
    ...heuristicIntent,
    action: aiIntent.action ?? heuristicIntent.action,
    scope: aiIntent.scope ?? heuristicIntent.scope,
    entity: aiIntent.entity ?? heuristicIntent.entity,
    includeEnded: aiIntent.includeEnded ?? heuristicIntent.includeEnded,
    prefersBrowse: aiIntent.prefersBrowse ?? heuristicIntent.prefersBrowse,
    intentSource: "heuristic+ai",
    aiEnhanced: true,
  };

  if (!merged.endTimeFrom && !merged.endTimeTo && aiIntent.timeWindow) {
    applyTimeWindowToIntent(merged, aiIntent.timeWindow);
  }

  const aiRetrievalQuery = aiIntent.retrievalQuery
    ? sanitizeRetrievalQuery(
        aiIntent.retrievalQuery,
        merged.matchedAuctionHouse,
      )
    : "";

  if (aiRetrievalQuery || !merged.retrievalQuery) {
    merged.retrievalQuery = aiRetrievalQuery;
  }

  if (!merged.retrievalQuery) {
    merged.prefersBrowse = true;
  }

  return merged;
}

export function isBroadBrowseQuery(query: string) {
  const normalizedQuery = getNormalizedQuery(query);
  return BROAD_BROWSE_TERMS.some((term) => normalizedQuery.includes(term));
}

export function deriveSearchIntent(
  query: string,
  options: { includeEnded?: boolean } = {},
): SearchIntent {
  const normalizedRawQuery = getNormalizedRawQuery(query);
  const normalizedQuery = getNormalizedQuery(query);
  const houseMatch = detectAuctionHouseMatch(normalizedRawQuery);
  const queryWithoutHouse = stripAuctionHouseTerms(
    normalizedQuery,
    houseMatch?.house ?? null,
  );
  const retrievalQuery = stripRetrievalNoiseTerms(queryWithoutHouse);

  const intent: SearchIntent = {
    normalizedRawQuery,
    normalizedQuery,
    queryWithoutHouse,
    retrievalQuery,
    matchedAuctionHouse: houseMatch?.house ?? null,
    includeEnded: Boolean(options.includeEnded),
    prefersBrowse: false,
    action: detectAction(normalizedRawQuery),
    scope: detectScope(normalizedRawQuery),
    entity: detectEntity(normalizedRawQuery),
    intentSource: "heuristic",
    aiEnhanced: false,
  };

  if (ENDED_QUERY_PATTERN.test(normalizedRawQuery)) {
    intent.includeEnded = true;
  }

  if (normalizedRawQuery.includes("idag")) {
    const range = getStockholmDayRange(0);
    intent.endTimeFrom = range.start.toISOString();
    intent.endTimeTo = range.end.toISOString();
    intent.prefersBrowse = true;
  } else if (normalizedRawQuery.includes("imorgon")) {
    const range = getStockholmDayRange(1);
    intent.endTimeFrom = range.start.toISOString();
    intent.endTimeTo = range.end.toISOString();
    intent.prefersBrowse = true;
  } else if (
    normalizedRawQuery.includes("ikvall") ||
    normalizedRawQuery.includes("ikväll")
  ) {
    const range = getStockholmDayRange(0);
    intent.endTimeFrom = new Date().toISOString();
    intent.endTimeTo = range.end.toISOString();
    intent.prefersBrowse = true;
  } else if (normalizedRawQuery.includes("snart")) {
    intent.endTimeFrom = new Date().toISOString();
    intent.endTimeTo = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    intent.prefersBrowse = true;
  } else if (normalizedRawQuery.includes("vecka")) {
    intent.endTimeFrom = new Date().toISOString();
    intent.endTimeTo = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    intent.prefersBrowse = true;
  }

  if (!retrievalQuery || /\b(alla|visa)\b/u.test(normalizedRawQuery)) {
    intent.prefersBrowse = true;
  }

  if (isBroadBrowseQuery(query)) {
    intent.prefersBrowse = true;
  }

  return intent;
}

export async function resolveSearchIntent(
  query: string,
  options: { includeEnded?: boolean } = {},
): Promise<SearchIntent> {
  const heuristicIntent = deriveSearchIntent(query, options);

  if (!shouldUseAiIntentParser(query, heuristicIntent)) {
    return heuristicIntent;
  }

  const cacheKey = JSON.stringify({
    query: heuristicIntent.normalizedRawQuery,
    includeEnded: options.includeEnded ?? false,
  });
  const now = Date.now();
  pruneAiIntentCache(now);
  const cached = aiIntentCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    await logAiUsage({
      provider: "google",
      model: "gemini-2.0-flash",
      operation: "search-intent-parse",
      status: "cache-hit",
      latencyMs: 0,
      itemCount: 1,
      cacheHit: true,
      metadata: { query },
    });
    return {
      ...cached.value,
      intentSource: "cache",
      aiEnhanced: true,
    };
  }

  const aiIntent = await parseSearchIntentWithAi(query, heuristicIntent);
  if (!aiIntent) {
    return heuristicIntent;
  }

  const resolved = mergeAiIntent(heuristicIntent, aiIntent);
  aiIntentCache.set(cacheKey, {
    expiresAt: now + SEARCH_INTENT_CACHE_TTL_MS,
    value: resolved,
  });

  return resolved;
}
