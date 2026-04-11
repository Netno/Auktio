import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { updateUserPreferenceSettings } from "@/lib/user-preference-settings";
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

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!canAccessPersonalizationForSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    personalizationEnabled?: unknown;
    searchHistoryEnabled?: unknown;
  };

  try {
    const settings = await updateUserPreferenceSettings(userId, {
      personalizationEnabled:
        typeof body.personalizationEnabled === "boolean"
          ? body.personalizationEnabled
          : undefined,
      searchHistoryEnabled:
        typeof body.searchHistoryEnabled === "boolean"
          ? body.searchHistoryEnabled
          : undefined,
    });

    return NextResponse.json({ ok: true, preferences: settings });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update preferences",
      },
      { status: 500 },
    );
  }
}
