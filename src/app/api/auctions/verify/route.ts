import { NextRequest, NextResponse } from "next/server";
import { getClientIP, rateLimit } from "@/lib/rate-limit";
import { verifyAuctionStatuses } from "@/lib/auction-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RATE_LIMIT_CONFIG = { maxRequests: 20, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = rateLimit(`auctions-verify:${ip}`, RATE_LIMIT_CONFIG);

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
    const ids = (searchParams.get("ids") ?? "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .slice(0, 25);

    const updates = await verifyAuctionStatuses(ids);

    return NextResponse.json(
      { updates },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[api/auctions/verify] Error:", error);
    return NextResponse.json(
      { error: "Failed to verify auctions" },
      { status: 500 },
    );
  }
}
