import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { isMissingSupabaseTableError } from "@/lib/supabase-table-errors";
import { refreshUserRecommendationMatches } from "@/lib/user-recommendation-matches";

type DirtyProfileRow = {
  user_id: string;
};

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.RECOMMENDATIONS_MAINTENANCE_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  return Boolean(configuredSecret) && token === configuredSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const staleCutoffIso = new Date(
    Date.now() - 1000 * 60 * 60 * 24 * 45,
  ).toISOString();

  const { data: dirtyProfiles, error: dirtyProfilesError } = await supabase
    .from("auc_user_interest_profiles")
    .select("user_id")
    .eq("is_dirty", true)
    .order("updated_at", { ascending: true })
    .limit(50);

  if (dirtyProfilesError) {
    return NextResponse.json(
      { error: dirtyProfilesError.message },
      { status: 500 },
    );
  }

  let refreshedUsers = 0;

  for (const profile of (dirtyProfiles ?? []) as DirtyProfileRow[]) {
    try {
      await refreshUserRecommendationMatches(profile.user_id);
      refreshedUsers += 1;
    } catch (error) {
      console.error("[recommendations-maintenance] Failed to refresh user:", {
        userId: profile.user_id,
        error,
      });
    }
  }

  const { data: inactiveLots, error: inactiveLotsError } = await supabase
    .from("auc_lots")
    .select("id")
    .or(`availability.in.(sold,unsold,withdrawn),end_time.lt.${nowIso}`)
    .limit(5000);

  if (inactiveLotsError) {
    return NextResponse.json(
      { error: inactiveLotsError.message },
      { status: 500 },
    );
  }

  const inactiveLotIds = (inactiveLots ?? [])
    .map((row) => Number(row.id))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (inactiveLotIds.length > 0) {
    const { error: deleteMatchesError } = await supabase
      .from("auc_user_matches")
      .delete()
      .in("lot_id", inactiveLotIds);

    if (deleteMatchesError) {
      return NextResponse.json(
        { error: deleteMatchesError.message },
        { status: 500 },
      );
    }
  }

  const [
    searchCleanup,
    rateLimitCleanup,
    verificationCleanup,
    passwordCleanup,
  ] = await Promise.all([
    supabase
      .from("auc_user_search_log")
      .delete()
      .is("user_id", null)
      .lt("created_at", staleCutoffIso),
    supabase
      .from("auc_auth_rate_limits")
      .delete()
      .lt("created_at", staleCutoffIso),
    supabase
      .from("auc_user_email_verification_tokens")
      .delete()
      .or(`expires_at.lt.${nowIso},consumed_at.not.is.null`),
    supabase
      .from("auc_user_password_reset_tokens")
      .delete()
      .or(`expires_at.lt.${nowIso},consumed_at.not.is.null`),
  ]);

  const cleanupResults = [
    rateLimitCleanup,
    verificationCleanup,
    passwordCleanup,
  ];

  if (
    searchCleanup.error &&
    !isMissingSupabaseTableError(searchCleanup.error, "auc_user_search_log")
  ) {
    return NextResponse.json(
      { error: searchCleanup.error.message },
      { status: 500 },
    );
  }

  for (const result of cleanupResults) {
    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    refreshedUsers,
    cleanedInactiveMatches: inactiveLotIds.length,
  });
}
