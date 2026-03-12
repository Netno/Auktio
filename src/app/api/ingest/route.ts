import { NextRequest, NextResponse } from "next/server";
import { ingestAllFeeds } from "@/lib/feed-ingester";
import { generateMissingEmbeddings } from "@/lib/embedding-ingester";

/**
 * POST /api/ingest
 *
 * Triggered by Vercel Cron (see vercel.json) or manually.
 * Protected by CRON_SECRET.
 *
 * Pipeline: 1) Fetch & upsert feeds → 2) Generate embeddings for new lots
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Step 1: Ingest feeds
    const feedResults = await ingestAllFeeds();

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
      { status: 500 }
    );
  }
}

// Also allow GET for easy testing in browser
export async function GET(request: NextRequest) {
  return POST(request);
}

// Vercel cron config
export const maxDuration = 60; // seconds
