/**
 * Vision describer — uses Gemini 2.0 Flash to generate text descriptions
 * of lot images. These descriptions are embedded alongside the lot text
 * so that visual attributes (colors, materials, shapes) become searchable.
 *
 * Run: npm run describe
 */

import { createServerClient } from "./supabase";

const GEMINI_VISION_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const BATCH_SIZE = 10;
const DELAY_BETWEEN_ITEMS_MS = 600; // respect rate limits

const DESCRIBE_PROMPT = `Beskriv detta auktionsföremål kort och detaljerat på svenska.
Inkludera: typ av föremål, material, färger, stil/period, form, och tänkbart användningsområde.
Var koncis — max 80 ord. Svara BARA med beskrivningen, inget annat.`;

export interface DescribeResult {
  processed: number;
  errors: number;
  durationMs: number;
}

/**
 * Download an image and return as base64 + mime type.
 */
async function fetchImageAsBase64(
  url: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mimeType: contentType };
  } catch {
    return null;
  }
}

/**
 * Use a smaller image variant for efficiency.
 * Replaces _lg with _sm in Skeleton media URLs.
 */
function toSmallImage(url: string): string {
  return url.replace(/_lg\.(jpe?g|png|webp)/i, "_sm.$1");
}

/**
 * Ask Gemini Vision to describe a single image.
 */
async function describeImage(imageUrl: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const smallUrl = toSmallImage(imageUrl);
  const imageData = await fetchImageAsBase64(smallUrl);
  if (!imageData) return null;

  const response = await fetch(`${GEMINI_VISION_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: DESCRIBE_PROMPT },
            {
              inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[vision] Gemini error ${response.status}: ${err}`);
    return null;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text?.trim() ?? null;
}

/**
 * Generate image descriptions for all lots missing them.
 * Also clears the embedding so re-embedding picks up the new description.
 */
export async function generateMissingDescriptions(): Promise<DescribeResult> {
  const startTime = Date.now();
  const supabase = createServerClient();
  let processed = 0;
  let errors = 0;

  console.log("[vision] Starting image description generation...");

  let hasMore = true;
  let lastId = 0;

  while (hasMore) {
    const { data: lots, error } = await supabase
      .from("auc_lots")
      .select("id, title, images, thumbnail_url")
      .is("image_description", null)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error("[vision] Fetch error:", error.message);
      break;
    }

    if (!lots?.length) {
      hasMore = false;
      break;
    }

    for (const lot of lots) {
      const imageUrl =
        lot.thumbnail_url ?? (lot.images as string[])?.[0] ?? null;

      if (!imageUrl) {
        // No image — store empty marker so we skip next time
        await supabase
          .from("auc_lots")
          .update({ image_description: "" })
          .eq("id", lot.id);
        lastId = lot.id;
        continue;
      }

      try {
        const description = await describeImage(imageUrl);

        if (description) {
          // Store description and clear embedding for re-generation
          const { error: updateError } = await supabase
            .from("auc_lots")
            .update({
              image_description: description,
              embedding: null,
            })
            .eq("id", lot.id);

          if (updateError) {
            console.error(
              `[vision] Update error for lot ${lot.id}:`,
              updateError.message,
            );
            errors++;
          } else {
            processed++;
          }
        } else {
          // Vision failed, store empty marker
          await supabase
            .from("auc_lots")
            .update({ image_description: "" })
            .eq("id", lot.id);
          errors++;
        }
      } catch (err) {
        console.error(`[vision] Error for lot ${lot.id}:`, err);
        errors++;
      }

      lastId = lot.id;
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_ITEMS_MS));
    }

    console.log(
      `[vision] Progress: ${processed} described, ${errors} errors, last ID: ${lastId}`,
    );
  }

  const result: DescribeResult = {
    processed,
    errors,
    durationMs: Date.now() - startTime,
  };

  console.log(
    `[vision] Complete: ${processed} described, ${errors} errors, ${result.durationMs}ms`,
  );

  return result;
}

// CLI entry point: `npm run describe`
if (require.main === module) {
  generateMissingDescriptions()
    .then((result) => {
      console.log("[vision] Done:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[vision] Fatal error:", err);
      process.exit(1);
    });
}
