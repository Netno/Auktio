import { NextRequest, NextResponse } from "next/server";
import {
  runIngestPipeline,
  type IngestPipelineOptions,
} from "@/lib/ingest-pipeline";

/**
 * Shared handler for manual ingest runs and cron-triggered batch routes.
 */
export async function handleIngestRoute(
  request: NextRequest,
  options: IngestPipelineOptions = {},
) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const mode = request.nextUrl.searchParams.get("mode");
    const result = await runIngestPipeline(
      mode === "full" ? "full" : "feed",
      options,
    );

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

export const maxDuration = 300;
