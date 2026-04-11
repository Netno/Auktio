import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { ANONYMOUS_SESSION_COOKIE_NAME } from "@/lib/anonymous-session";
import {
  addAnonymousFavorites,
  consumeAnonymousFavoritesIntoUser,
  listAnonymousFavoriteLotIds,
  removeAnonymousFavorite,
} from "@/lib/anonymous-favorites";
import {
  addUserFavorites,
  listUserFavoriteLotIds,
  removeUserFavorite,
} from "@/lib/user-favorites";
import { markUserInterestProfileDirty } from "@/lib/user-recommendation-matches";
import { canAccessPersonalizationForSession } from "@/lib/recommendations-access";

function getSessionUserId(
  session:
    | {
        user?: {
          id?: string | null;
        };
      }
    | null
    | undefined,
) {
  const userId = session?.user?.id;
  return typeof userId === "string" && userId.trim().length > 0 ? userId : null;
}

function getAnonymousSessionId(request: NextRequest) {
  const sessionId = request.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)?.value;
  return typeof sessionId === "string" && sessionId.trim().length > 0
    ? sessionId
    : null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!canAccessPersonalizationForSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = getSessionUserId(session);

  if (userId) {
    const lotIds = await listUserFavoriteLotIds(userId);
    return NextResponse.json({ ok: true, lotIds });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!canAccessPersonalizationForSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = getSessionUserId(session);
  const anonymousSessionId = getAnonymousSessionId(request);

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

  if (userId) {
    if (anonymousSessionId) {
      const anonymousLotIds = await consumeAnonymousFavoritesIntoUser(
        userId,
        anonymousSessionId,
      );

      const nextLotIds = await addUserFavorites(userId, [
        ...anonymousLotIds,
        ...lotIds,
      ]);

      await markUserInterestProfileDirty(userId);

      return NextResponse.json({ ok: true, lotIds: nextLotIds });
    }

    const nextLotIds = await addUserFavorites(userId, lotIds);
    await markUserInterestProfileDirty(userId);
    return NextResponse.json({ ok: true, lotIds: nextLotIds });
  }

  if (!anonymousSessionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nextLotIds = await addAnonymousFavorites(anonymousSessionId, lotIds);
  return NextResponse.json({ ok: true, lotIds: nextLotIds });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!canAccessPersonalizationForSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = getSessionUserId(session);
  const anonymousSessionId = getAnonymousSessionId(request);

  const lotIdValue = request.nextUrl.searchParams.get("lotId");
  const lotId = Number(lotIdValue);

  if (!Number.isInteger(lotId) || lotId <= 0) {
    return NextResponse.json({ error: "Invalid lotId" }, { status: 400 });
  }

  if (userId) {
    const nextLotIds = await removeUserFavorite(userId, lotId);
    await markUserInterestProfileDirty(userId);
    return NextResponse.json({ ok: true, lotIds: nextLotIds });
  }

  if (!anonymousSessionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nextLotIds = await removeAnonymousFavorite(anonymousSessionId, lotId);
  return NextResponse.json({ ok: true, lotIds: nextLotIds });
}
