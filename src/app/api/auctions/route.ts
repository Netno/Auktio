import { NextRequest, NextResponse } from "next/server";
import { getClientIP, rateLimit } from "@/lib/rate-limit";
import { listAuctionSummaries } from "@/lib/auction-status";
import type { AuctionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RATE_LIMIT_CONFIG = { maxRequests: 30, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = rateLimit(`auctions:${ip}`, RATE_LIMIT_CONFIG);

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status: AuctionStatus | "all" =
      statusParam === "upcoming" ||
      statusParam === "ongoing" ||
      statusParam === "ended" ||
      statusParam === "uncertain"
        ? statusParam
        : "all";

    const daysBack = Math.min(
      30,
      Math.max(0, Number(searchParams.get("daysBack")) || 14),
    );
    const daysForward = Math.min(
      30,
      Math.max(0, Number(searchParams.get("daysForward")) || 14),
    );

    const result = await listAuctionSummaries({
      status,
      daysBack,
      daysForward,
      houseId: searchParams.get("houseId") ?? undefined,
      verifySites: false,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/auctions] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to load auctions",
      },
      { status: 500 },
    );
  }
}
