import { createServerClient } from "./supabase";
import { extractGeminiUsageMetadata, logAiUsage } from "./ai-usage-log";
import { regenerateEmbeddings } from "./embedding-ingester";
import { normalizeSearchText } from "./search-language";
import { CATEGORY_ORDER } from "@/config/sources";
import { needsCanonicalCategoryReview } from "./canonical-category-review";

const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const BATCH_SIZE = 25;
const DELAY_BETWEEN_BATCHES_MS = 400;
const MAX_TAGS_PER_LOT = 8;

export interface SubjectEnrichmentResult {
  processed: number;
  errors: number;
  embedded: number;
  durationMs: number;
}

interface LotForSubjectEnrichment {
  id: number;
  title: string;
  description: string | null;
  categories: string[] | null;
  ai_categories: string[] | null;
  end_time: string | null;
  availability: string | null;
  raw_data?: {
    category?: string[] | null;
  } | null;
}

interface GeminiTagRow {
  id: number;
  tags?: string[];
  categories?: string[];
}

interface EnrichmentPayload {
  tags: string[];
  categories: string[];
}

const CANONICAL_CATEGORIES = [...CATEGORY_ORDER];
const CANONICAL_CATEGORY_SET = new Set(CANONICAL_CATEGORIES);

const SUBJECT_PROMPT = `Du hjälper till att semantiskt märka auktionsföremål för sökning.

För varje objekt ska du returnera:
1. korta svenska taggar i lowercase som hjälper användare att hitta motiv, typ och överbegrepp
2. 1 eller 2 KANONISKA kategorier från den tillåtna listan

REGLER:
- Returnera ENDAST strikt JSON
- Format: [{"id":123,"categories":["Kategori"],"tags":["tagg1","tagg2"]}]
- Kategorier måste väljas EXAKT från denna lista: ${CANONICAL_CATEGORIES.join(", ")}
- Välj högst 2 kategorier
- Om du är osäker: välj den mest sannolika huvudkategorin hellre än många breda
- Högst 8 taggar per objekt
- Taggar ska vara korta, lowercase och utan punkt
- Inkludera gärna både specifikt motiv och bredare begrepp när det stöds tydligt av texten
- Exempel: leopard -> leopard, kattdjur, rovdjur, djur
- Exempel: lodjur -> lodjur, kattdjur, rovdjur, djur
- Exempel: fisk på porslinsfat -> fisk, djurmotiv, porslin
- Exempel: landskapsmåleri -> landskap, natur, målning, konst
- Var konservativ: hitta inte på detaljer som inte stöds av titel, beskrivning eller kategorier
- Ta gärna med objektstyp om den är viktig för sökningen, som tavla, målning, skulptur, porslin, fat, vas, leksak
- Undvik skräpord som fin, vacker, gammal, unik, samlarobjekt
- Taggar får inte vara tomma eller duplicerade
- Om råkategorin är generisk som Alla/Alle ska du klassificera utifrån titel och beskrivning
- Om texten är på danska, norska eller tyska ska du ändå välja svenska kategorier från listan`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJsonArray(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in Gemini response");
  }

  return candidate.slice(start, end + 1);
}

function sanitizeTags(tags: string[] | undefined) {
  if (!Array.isArray(tags)) return [];

  const normalized = tags
    .map((tag) => normalizeSearchText(String(tag)))
    .flatMap((tag) => (tag.split(" ").length > 6 ? [] : [tag]))
    .filter((tag) => tag.length >= 3)
    .slice(0, MAX_TAGS_PER_LOT);

  return Array.from(new Set(normalized));
}

function sanitizeCanonicalCategories(categories: string[] | undefined) {
  if (!Array.isArray(categories)) return [];

  const normalized = categories
    .map((category) => String(category).trim())
    .filter((category) =>
      CANONICAL_CATEGORY_SET.has(category as (typeof CATEGORY_ORDER)[number]),
    )
    .slice(0, 2);

  return Array.from(new Set(normalized));
}

async function generateSubjectTagsForBatch(
  lots: LotForSubjectEnrichment[],
): Promise<Map<number, EnrichmentPayload>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const startedAt = Date.now();

  const response = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${SUBJECT_PROMPT}\n\nOBJEKT:\n${JSON.stringify(
                lots.map((lot) => ({
                  id: lot.id,
                  title: lot.title,
                  description: lot.description,
                  categories: lot.categories ?? [],
                  sourceCategories: lot.raw_data?.category ?? [],
                })),
              )}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2500,
        topP: 0.8,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    await logAiUsage({
      provider: "google",
      model: "gemini-2.0-flash",
      operation: "subject-enrichment",
      status: "error",
      latencyMs: Date.now() - startedAt,
      errorMessage: `Gemini subject enrichment error ${response.status}: ${err}`,
      itemCount: lots.length,
    });
    throw new Error(
      `Gemini subject enrichment error ${response.status}: ${err}`,
    );
  }

  const data = await response.json();
  const usage = extractGeminiUsageMetadata(data);
  await logAiUsage({
    provider: "google",
    model: "gemini-2.0-flash",
    operation: "subject-enrichment",
    status: "success",
    latencyMs: Date.now() - startedAt,
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
    tokenMetricsReported: usage.tokenMetricsReported,
    itemCount: lots.length,
  });
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("\n") ?? "";

  const rows = JSON.parse(extractJsonArray(text)) as GeminiTagRow[];
  const result = new Map<number, EnrichmentPayload>();

  for (const row of rows) {
    if (!Number.isFinite(row.id)) continue;
    result.set(row.id, {
      tags: sanitizeTags(row.tags),
      categories: sanitizeCanonicalCategories(row.categories),
    });
  }

  return result;
}

export async function enrichSubjectTagsForLotIds(
  lotIds: number[],
): Promise<SubjectEnrichmentResult> {
  const startTime = Date.now();
  const supabase = createServerClient();
  let processed = 0;
  let errors = 0;
  let embedded = 0;

  const { data, error } = await supabase
    .from("auc_lots")
    .select(
      "id, title, description, categories, ai_categories, end_time, availability, raw_data",
    )
    .in("id", lotIds)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`[subjects] Fetch error: ${error.message}`);
  }

  const lots = (data ?? []) as LotForSubjectEnrichment[];
  const batches: LotForSubjectEnrichment[][] = [];

  for (let index = 0; index < lots.length; index += BATCH_SIZE) {
    batches.push(lots.slice(index, index + BATCH_SIZE));
  }

  for (const batch of batches) {
    const pendingLots = batch.filter(
      (lot) =>
        !lot.ai_categories ||
        lot.ai_categories.length === 0 ||
        needsCanonicalCategoryReview({
          categories: lot.categories,
          rawCategories: lot.raw_data?.category,
        }),
    );

    if (!pendingLots.length) {
      continue;
    }

    try {
      const generatedTags = await generateSubjectTagsForBatch(pendingLots);
      const updatedIds: number[] = [];

      for (const lot of pendingLots) {
        const enrichment = generatedTags.get(lot.id) ?? {
          tags: [],
          categories: [],
        };
        const nextUpdate: Record<string, unknown> = {};

        if (
          !lot.ai_categories ||
          lot.ai_categories.length === 0 ||
          enrichment.tags.length > 0
        ) {
          nextUpdate.ai_categories = enrichment.tags;
          nextUpdate.embedding = null;
        }

        if (
          needsCanonicalCategoryReview({
            categories: lot.categories,
            rawCategories: lot.raw_data?.category,
          }) &&
          enrichment.categories.length > 0
        ) {
          nextUpdate.categories = enrichment.categories;
          nextUpdate.embedding = null;
        }

        if (Object.keys(nextUpdate).length === 0) {
          continue;
        }

        const { error: updateError } = await supabase
          .from("auc_lots")
          .update(nextUpdate)
          .eq("id", lot.id);

        if (updateError) {
          errors++;
          continue;
        }

        processed++;
        updatedIds.push(lot.id);
      }

      if (updatedIds.length) {
        const embeddingResult = await regenerateEmbeddings(updatedIds);
        embedded += embeddingResult.processed;
        errors += embeddingResult.errors;
      }

      await sleep(DELAY_BETWEEN_BATCHES_MS);
    } catch {
      errors += pendingLots.length;
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  return {
    processed,
    errors,
    embedded,
    durationMs: Date.now() - startTime,
  };
}

export async function generateMissingSubjectTags(): Promise<SubjectEnrichmentResult> {
  const startTime = Date.now();
  const supabase = createServerClient();
  let processed = 0;
  let errors = 0;
  let embedded = 0;
  let lastId = 0;
  const nowIso = new Date().toISOString();

  console.log(
    "[subjects] Starting AI subject-tag enrichment for active lots...",
  );

  while (true) {
    const { data, error } = await supabase
      .from("auc_lots")
      .select(
        "id, title, description, categories, ai_categories, end_time, availability, raw_data",
      )
      .gt("id", lastId)
      .gt("end_time", nowIso)
      .is("availability", null)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      throw new Error(`[subjects] Fetch error: ${error.message}`);
    }

    const lots = (data ?? []) as LotForSubjectEnrichment[];
    if (!lots.length) break;

    const pendingLots = lots.filter(
      (lot) =>
        !lot.ai_categories ||
        lot.ai_categories.length === 0 ||
        needsCanonicalCategoryReview({
          categories: lot.categories,
          rawCategories: lot.raw_data?.category,
        }),
    );

    if (!pendingLots.length) {
      lastId = lots[lots.length - 1].id;
      continue;
    }

    try {
      const generatedTags = await generateSubjectTagsForBatch(pendingLots);
      const updatedIds: number[] = [];

      for (const lot of pendingLots) {
        const enrichment = generatedTags.get(lot.id) ?? {
          tags: [],
          categories: [],
        };
        const nextUpdate: Record<string, unknown> = {};

        if (
          !lot.ai_categories ||
          lot.ai_categories.length === 0 ||
          enrichment.tags.length > 0
        ) {
          nextUpdate.ai_categories = enrichment.tags;
          nextUpdate.embedding = null;
        }

        if (
          needsCanonicalCategoryReview({
            categories: lot.categories,
            rawCategories: lot.raw_data?.category,
          }) &&
          enrichment.categories.length > 0
        ) {
          nextUpdate.categories = enrichment.categories;
          nextUpdate.embedding = null;
        }

        if (Object.keys(nextUpdate).length === 0) {
          continue;
        }

        const { error: updateError } = await supabase
          .from("auc_lots")
          .update(nextUpdate)
          .eq("id", lot.id);

        if (updateError) {
          console.error(
            `[subjects] Update error for lot ${lot.id}:`,
            updateError.message,
          );
          errors++;
          continue;
        }

        processed++;
        updatedIds.push(lot.id);
      }

      if (updatedIds.length) {
        const embeddingResult = await regenerateEmbeddings(updatedIds);
        embedded += embeddingResult.processed;
        errors += embeddingResult.errors;
      }

      lastId = lots[lots.length - 1].id;
      console.log(
        `[subjects] Progress: ${processed} enriched, ${embedded} embeddings refreshed, ${errors} errors, last ID ${lastId}`,
      );
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    } catch (batchError) {
      console.error("[subjects] Batch error:", batchError);
      errors += pendingLots.length;
      lastId = lots[lots.length - 1].id;
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  const result: SubjectEnrichmentResult = {
    processed,
    errors,
    embedded,
    durationMs: Date.now() - startTime,
  };

  console.log("[subjects] Done:", JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  generateMissingSubjectTags()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[subjects] Fatal error:", err);
      process.exit(1);
    });
}
