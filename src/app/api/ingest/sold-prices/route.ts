import { NextRequest, NextResponse } from "next/server";
import { refreshAllSoldPrices } from "@/lib/feed-ingester";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const feedResults = await refreshAllSoldPrices();

    return NextResponse.json({
      ok: true,
      feedResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/ingest/sold-prices] Fatal error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export const maxDuration = 60;
