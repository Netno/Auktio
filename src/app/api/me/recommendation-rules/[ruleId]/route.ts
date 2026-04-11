import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth-options";
import {
  deleteUserRecommendationRule,
  updateUserRecommendationRule,
} from "@/lib/user-recommendation-rules";
import { type UpdateRecommendationRuleInput } from "@/lib/mina-sidor";
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

function parseRuleId(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid rule id.");
  }

  return parsed;
}

export async function PUT(
  request: Request,
  context: { params: { ruleId: string } },
) {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ruleId = parseRuleId(context.params.ruleId);
    const body = (await request.json()) as UpdateRecommendationRuleInput;
    const rule = await updateUserRecommendationRule(userId, ruleId, body);

    try {
      await Promise.all([
        refreshUserRecommendationMatches(userId),
        refreshUserAlertMatches(userId),
      ]);
    } catch (syncError) {
      console.error(
        "[recommendation-rules] Failed to refresh derived matches after update",
        syncError,
      );
    }

    return NextResponse.json(rule);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update recommendation rule.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: { ruleId: string } },
) {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ruleId = parseRuleId(context.params.ruleId);
    await deleteUserRecommendationRule(userId, ruleId);

    try {
      await Promise.all([
        refreshUserRecommendationMatches(userId),
        refreshUserAlertMatches(userId),
      ]);
    } catch (syncError) {
      console.error(
        "[recommendation-rules] Failed to refresh derived matches after delete",
        syncError,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete recommendation rule.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
