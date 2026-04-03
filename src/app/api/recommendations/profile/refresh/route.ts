import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessRecommendationsForSession } from "@/lib/recommendations-access";
import { computeAndStoreUserInterestProfile } from "@/lib/user-interest-profile";

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

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!canAccessRecommendationsForSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await computeAndStoreUserInterestProfile(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to compute user interest profile",
      },
      { status: 500 },
    );
  }
}