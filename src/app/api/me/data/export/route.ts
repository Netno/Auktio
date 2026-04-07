import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createServerClient } from "@/lib/supabase";
import { isMissingSupabaseTableError } from "@/lib/supabase-table-errors";
import { getUserPreferenceSettings } from "@/lib/user-preference-settings";

function getSessionUserId(
  session:
    | {
        user?: {
          id?: string | null;
          email?: string | null;
        };
      }
    | null
    | undefined,
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

  const supabase = createServerClient();
  const [preferences, searches, favorites, profile, matches] =
    await Promise.all([
      getUserPreferenceSettings(userId),
      supabase
        .from("auc_user_search_log")
        .select(
          "id, query_text, selected_categories, filters_applied, result_count, results_clicked, first_click_position, source, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("auc_user_favorites")
        .select("lot_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("auc_user_interest_profiles")
        .select("top_categories, source_breakdown, avg_price_range, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("auc_user_matches")
        .select("lot_id, score, match_source, created_at")
        .eq("user_id", userId)
        .order("score", { ascending: false }),
    ]);

  const isMissingSearchLogTable = isMissingSupabaseTableError(
    searches.error,
    "auc_user_search_log",
  );

  if (
    (searches.error && !isMissingSearchLogTable) ||
    favorites.error ||
    profile.error ||
    matches.error
  ) {
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 },
    );
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: userId,
      email: session?.user?.email ?? null,
    },
    preferences,
    searches: isMissingSearchLogTable ? [] : (searches.data ?? []),
    favorites: favorites.data ?? [],
    profile: profile.data ?? null,
    matches: matches.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="auktio-min-data-export.json"',
    },
  });
}
