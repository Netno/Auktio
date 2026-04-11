import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ANONYMOUS_SESSION_COOKIE_NAME } from "@/lib/anonymous-session";
import { authOptions } from "@/lib/auth-options";
import { migrateAnonymousActivityToUser } from "@/lib/anonymous-activity-migration";
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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!canAccessPersonalizationForSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = getSessionUserId(session);
  const sessionId =
    request.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)?.value ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionId) {
    return NextResponse.json({ ok: true, migrated: false });
  }

  try {
    const result = await migrateAnonymousActivityToUser(userId, sessionId);
    return NextResponse.json({ ok: true, migrated: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to migrate anonymous activity",
      },
      { status: 500 },
    );
  }
}
