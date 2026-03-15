import { createServerClient } from "./supabase";
import { regenerateEmbeddings } from "./embedding-ingester";
import { normalizeSearchText } from "./search-language";

const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const BATCH_SIZE = 25;
const DELAY_BETWEEN_BATCHES_MS = 400;
const MAX_TAGS_PER_LOT = 8;

interface SubjectEnrichmentResult {
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
}

interface GeminiTagRow {
  id: number;
  tags?: string[];
}

const SUBJECT_PROMPT = `Du hjälper till att semantiskt märka auktionsföremål för sökning.

För varje objekt ska du returnera korta svenska taggar i lowercase som hjälper användare att hitta motiv, typ och överbegrepp.

REGLER:
- Returnera ENDAST strikt JSON
- Format: [{"id":123,"tags":["tagg1","tagg2"]}]
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
- Taggar får inte vara tomma eller duplicerade`;

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
    .flatMap((tag) => tag.split(" ").length > 6 ? [] : [tag])
    .filter((tag) => tag.length >= 3)
    .slice(0, MAX_TAGS_PER_LOT);

  return Array.from(new Set(normalized));
}

async function generateSubjectTagsForBatch(
  lots: LotForSubjectEnrichment[],
): Promise<Map<number, string[]>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

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
    throw new Error(`Gemini subject enrichment error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("\n") ?? "";

  const rows = JSON.parse(extractJsonArray(text)) as GeminiTagRow[];
  const result = new Map<number, string[]>();

  for (const row of rows) {
    if (!Number.isFinite(row.id)) continue;
    result.set(row.id, sanitizeTags(row.tags));
  }

  return result;
}

export async function generateMissingSubjectTags(): Promise<SubjectEnrichmentResult> {
  const startTime = Date.now();
  const supabase = createServerClient();
  let processed = 0;
  let errors = 0;
  let embedded = 0;
  let lastId = 0;
  const nowIso = new Date().toISOString();

  console.log("[subjects] Starting AI subject-tag enrichment for active lots...");

  while (true) {
    const { data, error } = await supabase
      .from("auc_lots")
      .select("id, title, description, categories, ai_categories, end_time, availability")
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
      (lot) => !lot.ai_categories || lot.ai_categories.length === 0,
    );

    if (!pendingLots.length) {
      lastId = lots[lots.length - 1].id;
      continue;
    }

    try {
      const generatedTags = await generateSubjectTagsForBatch(pendingLots);
      const updatedIds: number[] = [];

      for (const lot of pendingLots) {
        const aiCategories = generatedTags.get(lot.id) ?? [];
        const { error: updateError } = await supabase
          .from("auc_lots")
          .update({
            ai_categories: aiCategories,
            embedding: null,
          })
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
