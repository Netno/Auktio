/**
 * Embedding generation using Google Gemini API.
 *
 * Uses text-embedding-004 (768 dimensions) which matches our pgvector column.
 * Free tier: 1500 requests/day — sufficient for daily feed ingestion.
 */

const GEMINI_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

const GEMINI_BATCH_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents";

const EMBEDDING_DIMENSIONS = 768;

interface EmbedResponse {
  embedding: {
    values: number[];
  };
}

interface BatchEmbedResponse {
  embeddings: Array<{
    values: number[];
  }>;
}

/**
 * Generate embedding for a single text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const response = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini embed error ${response.status}: ${err}`);
  }

  const data: EmbedResponse = await response.json();
  return data.embedding.values;
}

/**
 * Generate embedding for a search query (uses RETRIEVAL_QUERY task type
 * for better semantic matching against document embeddings).
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const response = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: query }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini query embed error ${response.status}: ${err}`);
  }

  const data: EmbedResponse = await response.json();
  return data.embedding.values;
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * Max 100 texts per batch.
 */
export async function generateBatchEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  // Gemini batch limit is 100
  const batches = chunkArray(texts, 100);
  const allEmbeddings: number[][] = [];

  for (const batch of batches) {
    const response = await fetch(`${GEMINI_BATCH_EMBED_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini batch embed error ${response.status}: ${err}`);
    }

    const data: BatchEmbedResponse = await response.json();
    allEmbeddings.push(...data.embeddings.map((e) => e.values));

    // Rate limiting: small delay between batches
    if (batches.length > 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return allEmbeddings;
}

/**
 * Build a rich text representation of a lot for embedding.
 * Combines title, description, categories, artist, and location
 * into a single coherent string optimized for semantic retrieval.
 */
export function buildLotEmbeddingText(lot: {
  title: string;
  description?: string | null;
  categories?: string[];
  artists?: string[];
  city?: string | null;
  estimate?: number | null;
  currency?: string;
  imageDescription?: string | null;
}): string {
  const parts: string[] = [];

  parts.push(lot.title);

  if (lot.artists?.length) {
    parts.push(`Konstnär/formgivare: ${lot.artists.join(", ")}`);
  }

  if (lot.categories?.length) {
    parts.push(`Kategori: ${lot.categories.join(", ")}`);
  }

  if (lot.description) {
    parts.push(lot.description);
  }

  if (lot.imageDescription) {
    parts.push(`Bild: ${lot.imageDescription}`);
  }

  if (lot.city) {
    parts.push(`Plats: ${lot.city}`);
  }

  if (lot.estimate) {
    parts.push(`Utropspris: ${lot.estimate} ${lot.currency ?? "SEK"}`);
  }

  return parts.join(". ");
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
