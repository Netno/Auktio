import { NextRequest, NextResponse } from "next/server";
import { createSearchClickLog } from "@/lib/search-click-log";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    searchId?: unknown;
    lotId?: unknown;
    positionInResults?: unknown;
  };

  const searchId = Number(body.searchId);
  const lotId = Number(body.lotId);
  const positionInResults = Number(body.positionInResults);

  if (!Number.isInteger(searchId) || searchId <= 0) {
    return NextResponse.json({ error: "Invalid searchId" }, { status: 400 });
  }

  if (!Number.isInteger(lotId) || lotId <= 0) {
    return NextResponse.json({ error: "Invalid lotId" }, { status: 400 });
  }

  if (!Number.isInteger(positionInResults) || positionInResults <= 0) {
    return NextResponse.json(
      { error: "Invalid positionInResults" },
      { status: 400 },
    );
  }

  try {
    await createSearchClickLog({ searchId, lotId, positionInResults });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create click log",
      },
      { status: 500 },
    );
  }
}
