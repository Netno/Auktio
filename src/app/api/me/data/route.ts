import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createServerClient } from "@/lib/supabase";
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

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const [preferences, searches, favorites, profile, matches] = await Promise.all([
    getUserPreferenceSettings(userId),
    supabase
      .from("auc_user_search_log")
      .select("id, query_text, selected_categories, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("auc_user_favorites")
      .select("lot_id", { count: "exact" })
      .eq("user_id", userId),
    supabase
      .from("auc_user_interest_profiles")
      .select("top_categories, source_breakdown, avg_price_range, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("auc_user_matches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  if (searches.error || favorites.error || profile.error || matches.error) {
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    preferences,
    summary: {
      searches: searches.count ?? 0,
      favorites: favorites.count ?? 0,
      matches: matches.count ?? 0,
    },
    recentSearches: (searches.data ?? []).map((row) => ({
      id: row.id,
      queryText: row.query_text,
      selectedCategories: row.selected_categories ?? [],
      createdAt: row.created_at,
    })),
    profile: {
      topCategories: profile.data?.top_categories ?? [],
      sourceBreakdown: profile.data?.source_breakdown ?? {},
      avgPriceRange: profile.data?.avg_price_range ?? {},
      updatedAt: profile.data?.updated_at ?? null,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    disablePersonalization?: unknown;
  };
  const disablePersonalization = body.disablePersonalization === true;
  const supabase = createServerClient();

  const [searchDelete, matchDelete, profileDelete] = await Promise.all([
    supabase.from("auc_user_search_log").delete().eq("user_id", userId),
    supabase.from("auc_user_matches").delete().eq("user_id", userId),
    supabase.from("auc_user_interest_profiles").delete().eq("user_id", userId),
  ]);

  if (searchDelete.error || matchDelete.error || profileDelete.error) {
    return NextResponse.json({ error: "Failed to clear personal data" }, { status: 500 });
  }

  if (disablePersonalization) {
    await supabase.from("auc_user_preference_settings").upsert(
      {
        user_id: userId,
        personalization_enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  return NextResponse.json({ ok: true });
}