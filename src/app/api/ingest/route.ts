import { NextRequest, NextResponse } from "next/server";
import { ingestAllFeeds, ingestFeedDataOnly } from "@/lib/feed-ingester";
import { generateMissingEmbeddings } from "@/lib/embedding-ingester";

/**
 * POST /api/ingest
 *
 * Triggered by Vercel Cron (see vercel.json) or manually.
 * Protected by CRON_SECRET.
 *
 * Default pipeline: evening feed sync and embeddings.
 * Use ?mode=full manually when both feed sync and sold-price refresh are needed.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const mode = request.nextUrl.searchParams.get("mode");
    const feedResults =
      mode === "full" ? await ingestAllFeeds() : await ingestFeedDataOnly();

    // Step 2: Generate embeddings for newly added lots (if Gemini key configured)
    let embeddingResult = null;
    if (process.env.GEMINI_API_KEY) {
      try {
        embeddingResult = await generateMissingEmbeddings();
      } catch (embErr) {
        console.error("[api/ingest] Embedding generation failed:", embErr);
        embeddingResult = {
          processed: 0,
          errors: 0,
          durationMs: 0,
          error: embErr instanceof Error ? embErr.message : "Unknown",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      feedResults,
      embeddingResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/ingest] Fatal error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Also allow GET for easy testing in browser
export async function GET(request: NextRequest) {
  return POST(request);
}

// Vercel cron config
export const maxDuration = 60; // seconds
