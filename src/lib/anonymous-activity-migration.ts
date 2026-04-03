import { consumeAnonymousFavoritesIntoUser } from "@/lib/anonymous-favorites";
import { createServerClient } from "@/lib/supabase";

export async function migrateAnonymousActivityToUser(
  userId: string,
  sessionId: string,
) {
  if (userId.trim().length === 0 || sessionId.trim().length === 0) {
    return {
      migratedFavoriteCount: 0,
      migratedSearchCount: 0,
    };
  }

  const migratedFavoriteLotIds = await consumeAnonymousFavoritesIntoUser(
    userId,
    sessionId,
  );

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_user_search_log")
    .update({ user_id: userId })
    .eq("session_id", sessionId)
    .is("user_id", null)
    .select("id");

  if (error) {
    throw new Error(
      `[anonymous-migration] Failed to migrate search logs: ${error.message}`,
    );
  }

  return {
    migratedFavoriteCount: migratedFavoriteLotIds.length,
    migratedSearchCount: Array.isArray(data) ? data.length : 0,
  };
}