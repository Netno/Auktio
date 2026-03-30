import { CATEGORY_ORDER } from "@/config/sources";
import { extractGeminiUsageMetadata, logAiUsage } from "./ai-usage-log";
import { regenerateEmbeddings } from "./embedding-ingester";
import { normalizeSearchText } from "./search-language";
import { createServerClient } from "./supabase";

const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const CANONICAL_CATEGORIES = [...CATEGORY_ORDER];
const CANONICAL_CATEGORY_SET = new Set(CANONICAL_CATEGORIES);
const MAX_AI_TAGS = 8;
const MAX_LEARNING_EXAMPLES = 6;

type CategoryReviewRow = {
  id: number;
  title: string;
  description: string | null;
  house_id: string | null;
  url: string | null;
  thumbnail_url: string | null;
  end_time: string | null;
  availability: string | null;
  categories: string[] | null;
  ai_categories: string[] | null;
  raw_data?: {
    category?: string[] | null;
  } | null;
  auc_auction_houses?: {
    name?: string | null;
  } | null;
};

type CategoryFeedbackRow = {
  title: string;
  previous_categories: string[] | null;
  corrected_categories: string[] | null;
  raw_categories: string[] | null;
  note: string | null;
};

type AdminCategorySuggestion = {
  categories: string[];
  tags: string[];
  reason: string | null;
};

export type AdminCategoryReviewLot = {
  id: number;
  title: string;
  houseId: string | null;
  houseName: string;
  url: string | null;
  thumbnailUrl: string | null;
  endTime: string | null;
  isActive: boolean;
  categories: string[];
  aiTags: string[];
  rawCategories: string[];
};

export type CategoryLearningExample = {
  title: string;
  previousCategories: string[];
  correctedCategories: string[];
  rawCategories: string[];
  note: string | null;
};

function isMissingCategoryFeedbackTableError(
  error: { message?: string } | null | undefined,
) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    message.includes("auc_category_feedback") ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes('relation "auc_category_feedback" does not exist')
  );
}

function sanitizeCanonicalCategories(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item) => String(item).trim())
    .filter((item) =>
      CANONICAL_CATEGORY_SET.has(item as (typeof CATEGORY_ORDER)[number]),
    )
    .slice(0, 2);

  return Array.from(new Set(normalized));
}

function sanitizeAiTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item) => normalizeSearchText(String(item)))
    .filter((item) => item.length >= 3 && item.split(" ").length <= 5)
    .slice(0, MAX_AI_TAGS);

  return Array.from(new Set(normalized));
}

function normalizeFeedbackTerms(input: Array<string | null | undefined>) {
  const joined = input.filter(Boolean).join(" ");
  return Array.from(
    new Set(
      normalizeSearchText(joined)
        .split(" ")
        .map((part) => part.trim())
        .filter((part) => part.length >= 3)
        .slice(0, 24),
    ),
  );
}

function mapReviewLot(row: CategoryReviewRow): AdminCategoryReviewLot {
  const nowIso = new Date().toISOString();

  return {
    id: row.id,
    title: row.title,
    houseId: row.house_id,
    houseName: row.auc_auction_houses?.name ?? row.house_id ?? "Okänt hus",
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    endTime: row.end_time,
    isActive: Boolean(
      row.end_time && row.end_time > nowIso && row.availability == null,
    ),
    categories: row.categories ?? [],
    aiTags: row.ai_categories ?? [],
    rawCategories: row.raw_data?.category ?? [],
  };
}

async function fetchLotForReview(lotId: number) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_lots")
    .select(
      "id, title, description, house_id, url, thumbnail_url, end_time, availability, categories, ai_categories, raw_data, auc_auction_houses(name)",
    )
    .eq("id", lotId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[admin-category-review] Failed to load lot: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error("Lot hittades inte");
  }

  return data as CategoryReviewRow;
}

async function searchLotsByTitle(query: string, houseId?: string, limit = 20) {
  const supabase = createServerClient();
  let request = supabase
    .from("auc_lots")
    .select(
      "id, title, description, house_id, url, thumbnail_url, end_time, availability, categories, ai_categories, raw_data, auc_auction_houses(name)",
    )
    .ilike("title", `%${query.replace(/[%,_]/g, " ").trim()}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (houseId) {
    request = request.eq("house_id", houseId);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(
      `[admin-category-review] Failed to search lots by title: ${error.message}`,
    );
  }

  return (data ?? []) as CategoryReviewRow[];
}

async function searchLotById(lotId: number, houseId?: string) {
  const supabase = createServerClient();
  let request = supabase
    .from("auc_lots")
    .select(
      "id, title, description, house_id, url, thumbnail_url, end_time, availability, categories, ai_categories, raw_data, auc_auction_houses(name)",
    )
    .eq("id", lotId)
    .limit(1);

  if (houseId) {
    request = request.eq("house_id", houseId);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(
      `[admin-category-review] Failed to search lot by id: ${error.message}`,
    );
  }

  return (data ?? []) as CategoryReviewRow[];
}

async function loadLearningExamples(lot: CategoryReviewRow) {
  const supabase = createServerClient();
  const normalizedTerms = normalizeFeedbackTerms([
    lot.title,
    lot.description,
    ...(lot.raw_data?.category ?? []),
  ]);

  if (normalizedTerms.length === 0) {
    return [] as CategoryLearningExample[];
  }

  const { data, error } = await supabase
    .from("auc_category_feedback")
    .select(
      "title, previous_categories, corrected_categories, raw_categories, note",
    )
    .overlaps("normalized_terms", normalizedTerms)
    .order("created_at", { ascending: false })
    .limit(MAX_LEARNING_EXAMPLES);

  if (error) {
    if (isMissingCategoryFeedbackTableError(error)) {
      return [] as CategoryLearningExample[];
    }

    throw new Error(
      `[admin-category-review] Failed to load learning examples: ${error.message}`,
    );
  }

  return ((data ?? []) as CategoryFeedbackRow[]).map((row) => ({
    title: row.title,
    previousCategories: row.previous_categories ?? [],
    correctedCategories: row.corrected_categories ?? [],
    rawCategories: row.raw_categories ?? [],
    note: row.note,
  }));
}

async function storeCategoryFeedback(params: {
  lot: CategoryReviewRow;
  userId: string | null;
  correctedCategories: string[];
  correctionType: "manual" | "ai-recategorize";
  note?: string | null;
}) {
  const supabase = createServerClient();
  const normalizedTerms = normalizeFeedbackTerms([
    params.lot.title,
    params.lot.description,
    ...(params.lot.raw_data?.category ?? []),
    ...params.correctedCategories,
  ]);

  const { error } = await supabase.from("auc_category_feedback").insert({
    lot_id: params.lot.id,
    user_id: params.userId,
    title: params.lot.title,
    house_id: params.lot.house_id,
    previous_categories: params.lot.categories ?? [],
    corrected_categories: params.correctedCategories,
    ai_tags: params.lot.ai_categories ?? [],
    raw_categories: params.lot.raw_data?.category ?? [],
    normalized_terms: normalizedTerms,
    correction_type: params.correctionType,
    note: params.note?.trim() || null,
  });

  if (error) {
    if (isMissingCategoryFeedbackTableError(error)) {
      return false;
    }

    throw new Error(
      `[admin-category-review] Failed to store category feedback: ${error.message}`,
    );
  }

  return true;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in Gemini response");
  }

  return candidate.slice(start, end + 1);
}

async function generateCategorySuggestion(
  lot: CategoryReviewRow,
  learningExamples: CategoryLearningExample[],
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const prompt = `Du granskar kategoriseringen av ett auktionsobjekt.

Returnera ENDAST strikt JSON i formatet:
{"categories":["Kategori"],"tags":["tagg1","tagg2"],"reason":"kort svensk förklaring"}

Regler:
- Kategorier måste väljas EXAKT från denna lista: ${CANONICAL_CATEGORIES.join(", ")}
- Välj 1 eller 2 kategorier
- Välj objektets faktiska typ, inte bara varumärken eller ord som råkar förekomma i titeln
- Om ett varumärke pekar åt ett annat håll än objektstypen ska objektstypen vinna
- Var konservativ och hitta inte på detaljer som inte stöds av titel, beskrivning eller råkategorier
- Taggar ska vara korta svenska sökord i lowercase

Tidigare adminkorrigeringar att lära av:
${JSON.stringify(learningExamples)}

Objekt:
${JSON.stringify({
  id: lot.id,
  title: lot.title,
  description: lot.description,
  currentCategories: lot.categories ?? [],
  currentAiTags: lot.ai_categories ?? [],
  rawCategories: lot.raw_data?.category ?? [],
})}`;

  const startedAt = Date.now();
  const response = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 800,
        topP: 0.8,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    await logAiUsage({
      provider: "google",
      model: "gemini-2.0-flash",
      operation: "admin-category-review",
      status: "error",
      latencyMs: Date.now() - startedAt,
      errorMessage: `Gemini admin category review error ${response.status}: ${errorText}`,
      itemCount: 1,
      metadata: { lotId: lot.id },
    });
    throw new Error(
      `Gemini admin category review error ${response.status}: ${errorText}`,
    );
  }

  const payload = await response.json();
  const usage = extractGeminiUsageMetadata(payload);
  await logAiUsage({
    provider: "google",
    model: "gemini-2.0-flash",
    operation: "admin-category-review",
    status: "success",
    latencyMs: Date.now() - startedAt,
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
    tokenMetricsReported: usage.tokenMetricsReported,
    itemCount: 1,
    metadata: { lotId: lot.id, learningExamples: learningExamples.length },
  });

  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("\n") ?? "";
  const parsed = JSON.parse(extractJsonObject(text)) as {
    categories?: unknown;
    tags?: unknown;
    reason?: unknown;
  };

  const categories = sanitizeCanonicalCategories(parsed.categories);
  if (categories.length === 0) {
    throw new Error("AI returnerade ingen giltig kategori");
  }

  return {
    categories,
    tags: sanitizeAiTags(parsed.tags),
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim().length > 0
        ? parsed.reason.trim()
        : null,
  } satisfies AdminCategorySuggestion;
}

export async function searchAdminCategoryReviewLots(params: {
  query: string;
  houseId?: string;
  limit?: number;
}) {
  const query = params.query.trim();
  if (query.length === 0) {
    return [] as AdminCategoryReviewLot[];
  }

  const rows = await searchLotsByTitle(
    query,
    params.houseId,
    params.limit ?? 20,
  );
  const numericId = Number(query);
  const exactRows =
    Number.isInteger(numericId) && numericId > 0
      ? await searchLotById(numericId, params.houseId)
      : [];

  return Array.from(
    new Map([...exactRows, ...rows].map((row) => [row.id, row])).values(),
  ).map(mapReviewLot);
}

export async function updateLotCategoryFromAdmin(params: {
  lotId: number;
  categories: string[];
  userId: string | null;
  note?: string | null;
}) {
  const lot = await fetchLotForReview(params.lotId);
  const nextCategories = sanitizeCanonicalCategories(params.categories);

  if (nextCategories.length === 0) {
    throw new Error("Välj minst en giltig kategori");
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("auc_lots")
    .update({ categories: nextCategories, embedding: null })
    .eq("id", params.lotId);

  if (error) {
    throw new Error(
      `[admin-category-review] Failed to update categories: ${error.message}`,
    );
  }

  const learningStored = await storeCategoryFeedback({
    lot,
    userId: params.userId,
    correctedCategories: nextCategories,
    correctionType: "manual",
    note: params.note,
  });

  await regenerateEmbeddings([params.lotId]);
  const updatedLot = await fetchLotForReview(params.lotId);

  return {
    lot: mapReviewLot(updatedLot),
    learningStored,
  };
}

export async function recategorizeLotWithAi(params: {
  lotId: number;
  userId: string | null;
  note?: string | null;
}) {
  const lot = await fetchLotForReview(params.lotId);
  const learningExamples = await loadLearningExamples(lot);
  const suggestion = await generateCategorySuggestion(lot, learningExamples);
  const supabase = createServerClient();
  const nextAiTags =
    suggestion.tags.length > 0 ? suggestion.tags : (lot.ai_categories ?? []);
  const { error } = await supabase
    .from("auc_lots")
    .update({
      categories: suggestion.categories,
      ai_categories: nextAiTags,
      embedding: null,
    })
    .eq("id", params.lotId);

  if (error) {
    throw new Error(
      `[admin-category-review] Failed to apply AI categorization: ${error.message}`,
    );
  }

  const learningStored = await storeCategoryFeedback({
    lot,
    userId: params.userId,
    correctedCategories: suggestion.categories,
    correctionType: "ai-recategorize",
    note: params.note ?? suggestion.reason,
  });

  await regenerateEmbeddings([params.lotId]);
  const updatedLot = await fetchLotForReview(params.lotId);

  return {
    lot: mapReviewLot(updatedLot),
    learningExampleCount: learningExamples.length,
    learningStored,
    reason: suggestion.reason,
  };
}
