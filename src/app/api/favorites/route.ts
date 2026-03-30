import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import {
  addUserFavorites,
  listUserFavoriteLotIds,
  removeUserFavorite,
} from "@/lib/user-favorites";

function getSessionUserId(
  session: Awaited<ReturnType<typeof getServerSession>>,
) {
  const userId = session?.user?.id;
  return typeof userId === "string" && userId.trim().length > 0 ? userId : null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lotIds = await listUserFavoriteLotIds(userId);
  return NextResponse.json({ ok: true, lotIds });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    lotId?: unknown;
    lotIds?: unknown;
  };

  const lotIds = Array.isArray(body.lotIds)
    ? body.lotIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : typeof body.lotId === "number" &&
        Number.isInteger(body.lotId) &&
        body.lotId > 0
      ? [body.lotId]
      : [];

  if (lotIds.length === 0) {
    return NextResponse.json({ error: "Missing lotId" }, { status: 400 });
  }

  const nextLotIds = await addUserFavorites(userId, lotIds);
  return NextResponse.json({ ok: true, lotIds: nextLotIds });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lotIdValue = request.nextUrl.searchParams.get("lotId");
  const lotId = Number(lotIdValue);

  if (!Number.isInteger(lotId) || lotId <= 0) {
    return NextResponse.json({ error: "Invalid lotId" }, { status: 400 });
  }

  const nextLotIds = await removeUserFavorite(userId, lotId);
  return NextResponse.json({ ok: true, lotIds: nextLotIds });
}
