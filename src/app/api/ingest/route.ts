import { NextRequest, NextResponse } from "next/server";
import { runIngestPipeline } from "@/lib/ingest-pipeline";

/**
 * POST /api/ingest
 *
 * Triggered by Vercel Cron (see vercel.json) or manually.
 * Protected by CRON_SECRET.
 *
 * Default pipeline: evening feed sync, subject enrichment and embeddings.
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
    const result = await runIngestPipeline(mode === "full" ? "full" : "feed");

    return NextResponse.json({ ok: true, ...result });
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
