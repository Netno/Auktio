import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth-options";
import { CATEGORY_ORDER } from "@/config/sources";
import { createServerClient } from "@/lib/supabase";
import { isMissingSupabaseTableError } from "@/lib/supabase-table-errors";
import { getUserPreferenceSettings } from "@/lib/user-preference-settings";
import { getUserNotificationSettings } from "@/lib/user-notification-settings";
import { listUserRecommendationRules } from "@/lib/user-recommendation-rules";
import { refreshUserAlertMatches } from "@/lib/user-alert-matches";
import { type MinaSidorPayload } from "@/lib/mina-sidor";
import { canAccessPersonalizationForSession } from "@/lib/recommendations-access";

type SearchLogRow = {
  id: number;
  query_text: string | null;
  result_count: number | null;
  created_at: string | null;
};

type InterestProfileRow = {
  top_categories: string[] | null;
  avg_price_range: Record<string, unknown> | null;
  updated_at: string | null;
};

type HouseFacetRow = {
  house_id: string;
  auc_auction_houses?: {
    name?: string | null;
  } | null;
};

function extractProfilePriceValue(
  avgPriceRange: Record<string, unknown> | null | undefined,
  key: "min" | "max",
) {
  const value = avgPriceRange?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

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

  const supabase = createServerClient();

  try {
    try {
      await refreshUserAlertMatches(userId);
    } catch (error) {
      console.warn(
        "[mina-sidor] Failed to refresh alert matches before page load",
        error,
      );
    }

    const [
      preferences,
      notificationSettings,
      recommendationRules,
      profileResult,
      favoritesResult,
      matchesResult,
      alertsResult,
      searchesResult,
      housesResult,
    ] = await Promise.all([
      getUserPreferenceSettings(userId),
      getUserNotificationSettings(userId),
      listUserRecommendationRules(userId),
      supabase
        .from("auc_user_interest_profiles")
        .select("top_categories, avg_price_range, updated_at")
        .eq("user_id", userId)
        .maybeSingle<InterestProfileRow>(),
      supabase
        .from("auc_user_favorites")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("auc_user_matches")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("auc_user_alert_matches")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("delivery_state", "pending"),
      supabase
        .from("auc_user_search_log")
        .select("id, query_text, result_count, created_at", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6)
        .returns<SearchLogRow[]>(),
      supabase
        .from("auc_lots")
        .select("house_id, auc_auction_houses(name)")
        .not("house_id", "is", null)
        .gt("end_time", new Date().toISOString())
        .returns<HouseFacetRow[]>(),
    ]);

    let recentSearches: MinaSidorPayload["recentSearches"] = [];
    let recentSearchCount = 0;

    if (searchesResult.error) {
      if (
        !isMissingSupabaseTableError(
          searchesResult.error,
          "auc_user_search_log",
        )
      ) {
        throw searchesResult.error;
      }
    } else {
      recentSearchCount = searchesResult.count ?? searchesResult.data.length;
      recentSearches = searchesResult.data.map((row) => ({
        id: row.id,
        query: row.query_text?.trim() || "Kategorival utan text",
        resultCount: row.result_count,
        searchedAt: row.created_at,
      }));
    }

    if (profileResult.error) {
      throw profileResult.error;
    }

    if (favoritesResult.error) {
      throw favoritesResult.error;
    }

    if (matchesResult.error) {
      throw matchesResult.error;
    }

    if (housesResult.error) {
      throw housesResult.error;
    }

    const houseCounts = new Map<string, { label: string; count: number }>();
    for (const row of housesResult.data ?? []) {
      if (!row.house_id) {
        continue;
      }

      const existing = houseCounts.get(row.house_id);
      if (existing) {
        existing.count += 1;
      } else {
        houseCounts.set(row.house_id, {
          label: row.auc_auction_houses?.name ?? row.house_id,
          count: 1,
        });
      }
    }

    const pendingAlertCount = alertsResult.error
      ? isMissingSupabaseTableError(
          alertsResult.error,
          "auc_user_alert_matches",
        )
        ? 0
        : (() => {
            throw alertsResult.error;
          })()
      : (alertsResult.count ?? 0);

    const payload: MinaSidorPayload = {
      preferences: {
        personalizationEnabled: preferences.personalizationEnabled,
        searchHistoryEnabled: preferences.searchHistoryEnabled,
        updatedAt: preferences.updatedAt,
      },
      notificationSettings,
      overview: {
        activeRulesCount: recommendationRules.filter((rule) => rule.enabled)
          .length,
        notificationRuleCount: recommendationRules.filter(
          (rule) => rule.surface === "notification" || rule.surface === "both",
        ).length,
        homeRuleCount: recommendationRules.filter(
          (rule) => rule.surface === "home" || rule.surface === "both",
        ).length,
        favoritesCount: favoritesResult.count ?? 0,
        recentSearchCount,
        recommendationMatchCount: matchesResult.count ?? 0,
        pendingAlertCount,
      },
      recommendationRules,
      profile: {
        topCategories: profileResult.data?.top_categories ?? [],
        priceMin: extractProfilePriceValue(
          profileResult.data?.avg_price_range,
          "min",
        ),
        priceMax: extractProfilePriceValue(
          profileResult.data?.avg_price_range,
          "max",
        ),
        updatedAt: profileResult.data?.updated_at ?? null,
      },
      recentSearches,
      availableCategories: [...CATEGORY_ORDER],
      availableHouses: Array.from(houseCounts.entries())
        .map(([value, entry]) => ({
          value,
          label: entry.label,
          count: entry.count,
        }))
        .sort(
          (left, right) =>
            right.count - left.count ||
            left.label.localeCompare(right.label, "sv-SE"),
        ),
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load Mina Sidor.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
