import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessRecommendationsForSession } from "@/lib/recommendations-access";
import { loadUserRecommendations } from "@/lib/recommendations-feed";
import { getUserPreferenceSettings } from "@/lib/user-preference-settings";

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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!canAccessRecommendationsForSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserPreferenceSettings(userId);

  if (!settings.personalizationEnabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      lots: [],
      refreshed: false,
      topCategories: [],
      sourceBreakdown: {},
      avgPriceRange: {},
      updatedAt: null,
    });
  }

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    const result = await loadUserRecommendations({
      userId,
      forceRefresh,
      limit: 6,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load recommendations",
      },
      { status: 500 },
    );
  }
}