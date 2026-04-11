import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth-options";
import {
  createUserRecommendationRule,
  listUserRecommendationRules,
} from "@/lib/user-recommendation-rules";
import { type CreateRecommendationRuleInput } from "@/lib/mina-sidor";
import { refreshUserRecommendationMatches } from "@/lib/user-recommendation-matches";
import { refreshUserAlertMatches } from "@/lib/user-alert-matches";
import { canAccessPersonalizationForSession } from "@/lib/recommendations-access";

async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!canAccessPersonalizationForSession(session)) {
    return null;
  }
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rules = await listUserRecommendationRules(userId);
    return NextResponse.json(rules);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load recommendation rules.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateRecommendationRuleInput;
    const rule = await createUserRecommendationRule(userId, body);

    try {
      await Promise.all([
        refreshUserRecommendationMatches(userId),
        refreshUserAlertMatches(userId),
      ]);
    } catch (syncError) {
      console.error(
        "[recommendation-rules] Failed to refresh derived matches after create",
        syncError,
      );
    }

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create recommendation rule.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
