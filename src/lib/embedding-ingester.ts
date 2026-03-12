/**
 * Embedding ingestion — generates vector embeddings for lots
 * that don't have them yet.
 *
 * Designed to run after feed ingestion, or on a separate schedule.
 * Uses batch embedding API for efficiency.
 */

import { createServerClient } from "./supabase";
import { generateBatchEmbeddings, buildLotEmbeddingText } from "./embeddings";

const BATCH_SIZE = 50;

export interface EmbeddingResult {
  processed: number;
  errors: number;
  durationMs: number;
}

/**
 * Generate embeddings for all lots missing them.
 */
export async function generateMissingEmbeddings(): Promise<EmbeddingResult> {
  const startTime = Date.now();
  const supabase = createServerClient();
  let processed = 0;
  let errors = 0;

  console.log(
    "[embeddings] Starting embedding generation for lots without vectors...",
  );

  // Fetch lots without embeddings in batches
  let hasMore = true;
  let lastId = 0;

  while (hasMore) {
    const { data: lots, error } = await supabase
      .from("auc_lots")
      .select(
        "id, title, description, categories, artists, city, estimate, currency, image_description",
      )
      .is("embedding", null)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error("[embeddings] Fetch error:", error.message);
      break;
    }

    if (!lots?.length) {
      hasMore = false;
      break;
    }

    // Build text representations
    const texts = lots.map((lot: any) =>
      buildLotEmbeddingText({
        title: lot.title,
        description: lot.description,
        categories: lot.categories,
        artists: lot.artists,
        city: lot.city,
        estimate: lot.estimate,
        currency: lot.currency,
        imageDescription: lot.image_description,
      }),
    );

    try {
      // Generate embeddings in batch
      const embeddings = await generateBatchEmbeddings(texts);

      // Update each lot with its embedding
      for (let i = 0; i < lots.length; i++) {
        const { error: updateError } = await supabase
          .from("auc_lots")
          .update({
            embedding: JSON.stringify(embeddings[i]),
          })
          .eq("id", lots[i].id);

        if (updateError) {
          console.error(
            `[embeddings] Update error for lot ${lots[i].id}:`,
            updateError.message,
          );
          errors++;
        } else {
          processed++;
        }
      }

      lastId = lots[lots.length - 1].id;
      console.log(
        `[embeddings] Batch complete: ${processed} processed, last ID: ${lastId}`,
      );

      // Rate limit: pause between batches
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error("[embeddings] Batch embedding error:", err);
      errors += lots.length;
      lastId = lots[lots.length - 1].id;
    }
  }

  const result: EmbeddingResult = {
    processed,
    errors,
    durationMs: Date.now() - startTime,
  };

  console.log(
    `[embeddings] Complete: ${processed} embedded, ${errors} errors, ${result.durationMs}ms`,
  );

  return result;
}

// CLI entry point: `npm run embed`
if (require.main === module) {
  generateMissingEmbeddings()
    .then((result) => {
      console.log("[embeddings] Done:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[embeddings] Fatal error:", err);
      process.exit(1);
    });
}

/**
 * Regenerate embeddings for a specific set of lot IDs.
 * Useful when lot data changes.
 */
export async function regenerateEmbeddings(
  lotIds: number[],
): Promise<EmbeddingResult> {
  const startTime = Date.now();
  const supabase = createServerClient();
  let processed = 0;
  let errors = 0;

  const batches: number[][] = [];
  for (let i = 0; i < lotIds.length; i += BATCH_SIZE) {
    batches.push(lotIds.slice(i, i + BATCH_SIZE));
  }

  for (const batchIds of batches) {
    const { data: lots } = await supabase
      .from("auc_lots")
      .select(
        "id, title, description, categories, artists, city, estimate, currency, image_description",
      )
      .in("id", batchIds);

    if (!lots?.length) continue;

    const texts = lots.map((lot: any) =>
      buildLotEmbeddingText({
        title: lot.title,
        description: lot.description,
        categories: lot.categories,
        artists: lot.artists,
        city: lot.city,
        estimate: lot.estimate,
        currency: lot.currency,
        imageDescription: lot.image_description,
      }),
    );

    try {
      const embeddings = await generateBatchEmbeddings(texts);

      for (let i = 0; i < lots.length; i++) {
        const { error } = await supabase
          .from("auc_lots")
          .update({ embedding: JSON.stringify(embeddings[i]) })
          .eq("id", lots[i].id);

        if (error) errors++;
        else processed++;
      }
    } catch {
      errors += lots.length;
    }
  }

  return { processed, errors, durationMs: Date.now() - startTime };
}
