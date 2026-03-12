/**
 * RAG (Retrieval-Augmented Generation) pipeline for Auktio.
 *
 * Flow:
 * 1. User asks a natural language question
 * 2. Generate query embedding via Gemini
 * 3. Retrieve top-K similar lots from pgvector
 * 4. (Optional) Hybrid: also run full-text search and merge results
 * 5. Build context from retrieved lots
 * 6. Send context + question to Gemini for answer generation
 * 7. Return structured response with answer + source lots
 */

import { createServerClient } from "./supabase";
import { generateQueryEmbedding } from "./embeddings";
import { formatDate, formatSEK } from "./utils";
import { FEED_SOURCES } from "@/config/sources";

const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

/** Maximum lots to retrieve for context */
const TOP_K_VECTOR = 15;
const TOP_K_FULLTEXT = 10;

/** Maximum lots to include in the final LLM context (after dedup + re-rank) */
const MAX_CONTEXT_LOTS = 12;

const QUERY_STOP_WORDS = new Set([
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
  "billig",
  "billiga",
  "bra",
  "bästa",
  "fynd",
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
]);

export interface RAGRequest {
  query: string;
  /** Optional filters to narrow retrieval */
  categories?: string[];
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Whether to include ended lots */
  includeEnded?: boolean;
}

export interface RAGResponse {
  answer: string;
  sources: RAGSourceLot[];
  retrievalStats: {
    vectorMatches: number;
    fulltextMatches: number;
    totalContextLots: number;
    queryTimeMs: number;
  };
}

export interface RAGSourceLot {
  id: number;
  title: string;
  description?: string;
  categories: string[];
  currentBid?: number;
  estimate?: number;
  currency: string;
  city?: string;
  houseName?: string;
  url: string;
  thumbnailUrl?: string;
  endTime?: string;
  similarity?: number;
}

interface DetectedAuctionHouse {
  id: string;
  name: string;
  aliases: string[];
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'.,!?():;/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HOUSE_MATCHERS: DetectedAuctionHouse[] = FEED_SOURCES.map((source) => {
  const aliases = new Set<string>();
  const normalizedName = normalizeText(source.name);
  const normalizedId = normalizeText(source.id.replace(/-/g, " "));
  const nameWithoutSuffix = normalizedName
    .replace(/\s+auktioner?$/u, "")
    .trim();

  aliases.add(normalizedName);
  aliases.add(normalizedId);

  if (nameWithoutSuffix.length >= 3) {
    aliases.add(nameWithoutSuffix);
  }

  const firstToken = nameWithoutSuffix.split(" ")[0];
  if (firstToken && firstToken.length >= 4) {
    aliases.add(firstToken);
  }

  return {
    id: source.id,
    name: source.name,
    aliases: Array.from(aliases).sort((a, b) => b.length - a.length),
  };
});

function detectAuctionHouse(query: string): DetectedAuctionHouse | null {
  const normalizedQuery = ` ${normalizeText(query)} `;

  for (const house of HOUSE_MATCHERS) {
    if (house.aliases.some((alias) => normalizedQuery.includes(` ${alias} `))) {
      return house;
    }
  }

  return null;
}

function normalizeAnswerBullets(answer: string): string {
  return answer.replace(/^\s*-\s+/gm, "• ");
}

function buildWordRoots(word: string): string[] {
  const roots = new Set<string>([word]);
  const suffixes = [
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

  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      roots.add(word.slice(0, -suffix.length));
    }
  }

  return Array.from(roots).filter((root) => root.length >= 3);
}

function extractQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      extractSignificantWords(query).flatMap((word) => buildWordRoots(word)),
    ),
  );
}

function extractSignificantWords(query: string): string[] {
  return normalizeText(query)
    .split(" ")
    .filter((word) => word.length >= 3 && !QUERY_STOP_WORDS.has(word));
}

function getLexicalMatch(lot: RAGSourceLot, queryTerms: string[]) {
  if (!queryTerms.length) {
    return { score: 0, strong: false };
  }

  const titleTokens = normalizeText(lot.title ?? "")
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));
  const categoryTokens = normalizeText((lot.categories ?? []).join(" "))
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));
  const descriptionTokens = normalizeText(lot.description ?? "")
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => buildWordRoots(token));

  const matchesTerm = (tokens: string[], term: string) =>
    tokens.some((token) => token === term || token.endsWith(term));

  let score = 0;
  let strong = false;

  for (const term of queryTerms) {
    const inTitle = matchesTerm(titleTokens, term);
    const inCategory = matchesTerm(categoryTokens, term);
    const inDescription = matchesTerm(descriptionTokens, term);

    if (inTitle) {
      score += 4;
      strong = true;
    } else if (inCategory) {
      score += 2;
    } else if (inDescription) {
      score += 1;
    }
  }

  return { score, strong };
}

/**
 * Execute the full RAG pipeline.
 */
export async function executeRAG(request: RAGRequest): Promise<RAGResponse> {
  const startTime = Date.now();
  const supabase = createServerClient();
  const detectedAuctionHouse = detectAuctionHouse(request.query);

  // ─── Step 1: Generate query embedding ───
  const queryEmbedding = await generateQueryEmbedding(request.query);

  // ─── Step 2: Hybrid retrieval (vector + fulltext in parallel) ───
  const [vectorResults, fulltextResults] = await Promise.all([
    retrieveByVector(supabase, queryEmbedding, request, detectedAuctionHouse),
    retrieveByFulltext(supabase, request, detectedAuctionHouse),
  ]);

  // ─── Step 3: Merge & deduplicate results ───
  const mergedLots = mergeAndRank(
    vectorResults,
    fulltextResults,
    request.query,
  );
  const contextLots = mergedLots.slice(0, MAX_CONTEXT_LOTS);

  // ─── Step 4: Generate answer with Gemini ───
  const answer = await generateAnswer(request.query, contextLots);

  return {
    answer,
    sources: contextLots,
    retrievalStats: {
      vectorMatches: vectorResults.length,
      fulltextMatches: fulltextResults.length,
      totalContextLots: contextLots.length,
      queryTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Retrieve lots by vector similarity (semantic search).
 */
async function retrieveByVector(
  supabase: any,
  queryEmbedding: number[],
  request: RAGRequest,
  detectedAuctionHouse: DetectedAuctionHouse | null,
): Promise<RAGSourceLot[]> {
  try {
    // Use the semantic_search_lots function from our schema
    const { data, error } = await supabase.rpc("auc_semantic_search_lots", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.35,
      match_count: TOP_K_VECTOR,
    });

    if (error) {
      console.error("[RAG] Vector search error:", error.message);
      return [];
    }

    // Fetch full lot details for the matched IDs
    if (!data?.length) return [];

    const lotIds = data.map((d: any) => d.lot_id);
    const similarities = new Map(
      data.map((d: any) => [d.lot_id, d.similarity]),
    );

    let lotQuery = supabase
      .from("auc_lots")
      .select(
        `id, title, description, categories, current_bid, estimate,
         house_id,
         currency, city, url, thumbnail_url, end_time,
         auc_auction_houses!inner(name)`,
      )
      .in("id", lotIds);

    if (detectedAuctionHouse) {
      lotQuery = lotQuery.eq("house_id", detectedAuctionHouse.id);
    }

    if (!request.includeEnded) {
      lotQuery = lotQuery
        .gt("end_time", new Date().toISOString())
        .is("availability", null);
    }

    const { data: lots } = await lotQuery;

    return (lots ?? []).map((lot: any) => ({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      categories: lot.categories,
      currentBid: lot.current_bid,
      estimate: lot.estimate,
      currency: lot.currency,
      city: lot.city,
      url: lot.url,
      thumbnailUrl: lot.thumbnail_url,
      endTime: lot.end_time,
      houseName: lot.auc_auction_houses?.name,
      similarity: similarities.get(lot.id),
    }));
  } catch (err) {
    console.error("[RAG] Vector retrieval failed:", err);
    return [];
  }
}

/**
 * Retrieve lots by full-text search (keyword matching).
 */
async function retrieveByFulltext(
  supabase: any,
  request: RAGRequest,
  detectedAuctionHouse: DetectedAuctionHouse | null,
): Promise<RAGSourceLot[]> {
  try {
    const searchWords = extractSignificantWords(request.query);
    const searchQuery = searchWords.length
      ? searchWords.join(" ")
      : request.query;

    let query = supabase
      .from("auc_lots")
      .select(
        `id, title, description, categories, current_bid, estimate,
         house_id,
         currency, city, url, thumbnail_url, end_time,
         auc_auction_houses!inner(name)`,
      )
      .textSearch("search_text", searchQuery, {
        type: "websearch",
        config: "swedish",
      })
      .limit(TOP_K_FULLTEXT);

    if (!request.includeEnded) {
      query = query
        .gt("end_time", new Date().toISOString())
        .is("availability", null);
    }
    if (request.categories?.length) {
      query = query.overlaps("categories", request.categories);
    }
    if (request.city) {
      query = query.eq("city", request.city);
    }
    if (detectedAuctionHouse) {
      query = query.eq("house_id", detectedAuctionHouse.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[RAG] Fulltext search error:", error.message);
      return [];
    }

    return (data ?? []).map((lot: any) => ({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      categories: lot.categories,
      currentBid: lot.current_bid,
      estimate: lot.estimate,
      currency: lot.currency,
      city: lot.city,
      url: lot.url,
      thumbnailUrl: lot.thumbnail_url,
      endTime: lot.end_time,
      houseName: lot.auc_auction_houses?.name,
    }));
  } catch (err) {
    console.error("[RAG] Fulltext retrieval failed:", err);
    return [];
  }
}

/**
 * Merge vector and fulltext results, deduplicate, and rank.
 * Lots appearing in both lists get a boost.
 */
function mergeAndRank(
  vectorLots: RAGSourceLot[],
  fulltextLots: RAGSourceLot[],
  userQuery: string,
): RAGSourceLot[] {
  const queryTerms = extractQueryTerms(userQuery);
  const lotMap = new Map<
    number,
    RAGSourceLot & {
      score: number;
      lexicalScore: number;
      strongLexical: boolean;
    }
  >();

  // Vector results (primary, scored by similarity)
  for (const lot of vectorLots) {
    const lexical = getLexicalMatch(lot, queryTerms);
    lotMap.set(lot.id, {
      ...lot,
      score: (lot.similarity ?? 0.5) * 1.0 + lexical.score * 0.12,
      lexicalScore: lexical.score,
      strongLexical: lexical.strong,
    });
  }

  // Fulltext results (boost if also found by vector)
  for (let i = 0; i < fulltextLots.length; i++) {
    const lot = fulltextLots[i];
    const existing = lotMap.get(lot.id);
    const lexical = getLexicalMatch(lot, queryTerms);

    if (existing) {
      // Found in both — boost score
      existing.score +=
        0.45 + (TOP_K_FULLTEXT - i) * 0.03 + lexical.score * 0.08;
      existing.lexicalScore = Math.max(existing.lexicalScore, lexical.score);
      existing.strongLexical = existing.strongLexical || lexical.strong;
    } else {
      lotMap.set(lot.id, {
        ...lot,
        score: 0.45 + (TOP_K_FULLTEXT - i) * 0.03 + lexical.score * 0.12,
        lexicalScore: lexical.score,
        strongLexical: lexical.strong,
      });
    }
  }

  let rankedLots = Array.from(lotMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ score, lexicalScore, strongLexical, ...lot }) => ({
      ...lot,
      _lexicalScore: lexicalScore,
      _strongLexical: strongLexical,
    }));

  const strongLexicalLots = rankedLots.filter((lot) => lot._strongLexical);

  if (strongLexicalLots.length > 0) {
    rankedLots = strongLexicalLots;
  } else {
    const weakLexicalLots = rankedLots.filter((lot) => lot._lexicalScore > 0);
    if (weakLexicalLots.length > 0) {
      rankedLots = weakLexicalLots;
    }
  }

  return rankedLots.map(({ _lexicalScore, _strongLexical, ...lot }) => lot);
}

/**
 * Generate a natural language answer using Gemini with the retrieved context.
 */
async function generateAnswer(
  userQuery: string,
  contextLots: RAGSourceLot[],
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const now = new Date();
  const currentDateIso = now.toISOString();
  const currentDateSwedish = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);

  // Build context block from retrieved lots
  const contextBlock = contextLots
    .map((lot, i) => {
      const parts = [
        `[${i + 1}] "${lot.title}"`,
        lot.houseName ? `Auktionshus: ${lot.houseName}` : null,
        lot.categories?.length
          ? `Kategori: ${lot.categories.join(", ")}`
          : null,
        lot.description ? `Beskrivning: ${lot.description}` : null,
        lot.currentBid ? `Bud: ${formatSEK(lot.currentBid)}` : null,
        lot.estimate ? `Utrop: ${formatSEK(lot.estimate)}` : null,
        lot.endTime ? `Slutar: ${formatDate(lot.endTime)}` : null,
        lot.city ? `Plats: ${lot.city}` : null,
        lot.url ? `Länk: ${lot.url}` : null,
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");

  const systemPrompt = `Du är Auktio AI, en hjälpsam auktionsassistent för svenska auktioner.
Du har tillgång till ett urval av aktuella auktionsföremål som kontext.

REGLER:
- Svara ALLTID på svenska
- Idag är ${currentDateSwedish} (Stockholmstid). Om du använder ord som "idag", "imorgon", "i dag" eller nämner dagens datum måste du utgå exakt från detta datum
- Du får ALDRIG hitta på ett annat aktuellt datum än ${currentDateSwedish}
- Basera dina svar på de föremål som finns i kontexten
- Referera till specifika föremål med deras titel och auktionshus
- Om du rekommenderar föremål, förklara VARFÖR de matchar frågan
- Om kontexten inte innehåller relevant information, säg det ärligt
- Om sluttid finns i kontexten ska du använda den, särskilt vid frågor om "slutar snart"
- Var koncis men informativ
- Nämn prisuppgifter (bud och utrop) när det är relevant
- Inkludera ALDRIG föremålsnummer som [1], [2] etc i ditt svar — referera med namn istället
- Om användaren frågar om trender eller jämförelser, analysera de tillgängliga föremålen
- Du kan ge generella auktionsråd baserat på din kunskap

FORMAT:
- Om du nämner två eller fler konkreta föremål, börja med rubriken "Föremål:" och lista dem på separata rader
- Varje rad i listan ska ha formatet "• titel, auktionshus, bud, utrop". Använd tecknet "•" i början av varje rad. Utelämna bara den prisuppgift som saknas
- Efter listan kan du ge en kort sammanfattning eller rekommendation i löpande text
- Håll svaret under 300 ord
- Avsluta gärna med ett relevant tips eller förslag`;

  const userPrompt = `DAGENS DATUM: ${currentDateSwedish}
TIDSANKARE (ISO): ${currentDateIso}

KONTEXT — Aktuella auktionsföremål:

${contextBlock}

---

FRÅGA: ${userQuery}`;

  const response = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
        topP: 0.9,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini generation error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const answer =
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    "Jag kunde tyvärr inte generera ett svar just nu.";

  return normalizeAnswerBullets(answer);
}
