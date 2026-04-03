import { createServerClient } from "@/lib/supabase";
import { computeAndStoreUserInterestProfile } from "@/lib/user-interest-profile";

type SemanticMatchRow = {
  lot_id: number;
  similarity: number;
  categories: string[] | null;
};

type ProfileRow = {
  centroid_embedding: unknown;
  top_categories: string[] | null;
};

function parseEmbedding(value: unknown) {
  if (Array.isArray(value)) {
    const vector = value.filter(
      (item): item is number => typeof item === "number" && Number.isFinite(item),
    );

    return vector.length > 0 ? vector : null;
  }

  if (typeof value === "string") {
    try {
      return parseEmbedding(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return null;
}

function buildCategoryBoost(
  matchCategories: string[] | null | undefined,
  topCategories: string[] | null | undefined,
) {
  if (!matchCategories?.length || !topCategories?.length) {
    return 0;
  }

  const topCategorySet = new Set(topCategories);
  const overlapCount = matchCategories.filter((category) =>
    topCategorySet.has(category),
  ).length;

  return Math.min(0.12, overlapCount * 0.03);
}

export async function markUserInterestProfileDirty(userId: string) {
  if (userId.trim().length === 0) {
    return;
  }

  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("auc_user_interest_profiles").upsert(
    {
      user_id: userId,
      is_dirty: true,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(
      `[recommendation-matches] Failed to mark profile dirty: ${error.message}`,
    );
  }
}

export async function refreshUserRecommendationMatches(userId: string) {
  const profileResult = await computeAndStoreUserInterestProfile(userId);
  const supabase = createServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("auc_user_interest_profiles")
    .select("centroid_embedding, top_categories")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `[recommendation-matches] Failed to load interest profile: ${profileError.message}`,
    );
  }

  const centroidEmbedding = parseEmbedding(
    (profile as ProfileRow | null)?.centroid_embedding,
  );
  const topCategories = (profile as ProfileRow | null)?.top_categories ?? [];

  if (!centroidEmbedding) {
    await supabase.from("auc_user_matches").delete().eq("user_id", userId);
    return {
      ...profileResult,
      matchCount: 0,
    };
  }

  const { data: semanticMatches, error: semanticMatchesError } = await supabase.rpc(
    "auc_semantic_search_lots",
    {
      query_embedding: JSON.stringify(centroidEmbedding),
      match_threshold: 0.72,
      match_count: 60,
    },
  );

  if (semanticMatchesError) {
    throw new Error(
      `[recommendation-matches] Failed to run semantic matches: ${semanticMatchesError.message}`,
    );
  }

  const candidates = ((semanticMatches ?? []) as SemanticMatchRow[])
    .map((row) => ({
      lotId: row.lot_id,
      score: Math.min(
        0.999,
        row.similarity + buildCategoryBoost(row.categories, topCategories),
      ),
    }))
    .filter((row) => Number.isInteger(row.lotId) && row.lotId > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 40);

  const { error: deleteError } = await supabase
    .from("auc_user_matches")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(
      `[recommendation-matches] Failed to clear previous matches: ${deleteError.message}`,
    );
  }

  if (candidates.length > 0) {
    const { error: insertError } = await supabase.from("auc_user_matches").insert(
      candidates.map((candidate) => ({
        user_id: userId,
        lot_id: candidate.lotId,
        score: candidate.score,
        match_source: "interest_profile_v1",
      })),
    );

    if (insertError) {
      throw new Error(
        `[recommendation-matches] Failed to store matches: ${insertError.message}`,
      );
    }
  }

  return {
    ...profileResult,
    matchCount: candidates.length,
  };
}