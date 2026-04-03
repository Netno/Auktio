import { createServerClient } from "@/lib/supabase";
import { addUserFavorites } from "@/lib/user-favorites";

function normalizeLotIds(lotIds: number[]) {
  return Array.from(
    new Set(lotIds.filter((lotId) => Number.isInteger(lotId) && lotId > 0)),
  );
}

export async function listAnonymousFavoriteLotIds(sessionId: string) {
  if (sessionId.trim().length === 0) {
    return [];
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_anonymous_favorites")
    .select("lot_id")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `[favorites] Failed to list anonymous favorites: ${error.message}`,
    );
  }

  return (data ?? [])
    .map((row) => Number(row.lot_id))
    .filter((lotId) => Number.isInteger(lotId) && lotId > 0);
}

export async function addAnonymousFavorites(sessionId: string, lotIds: number[]) {
  if (sessionId.trim().length === 0) {
    throw new Error("Invalid sessionId");
  }

  const normalizedLotIds = normalizeLotIds(lotIds);

  if (normalizedLotIds.length === 0) {
    return listAnonymousFavoriteLotIds(sessionId);
  }

  const supabase = createServerClient();
  const { error } = await supabase.from("auc_anonymous_favorites").upsert(
    normalizedLotIds.map((lotId) => ({ session_id: sessionId, lot_id: lotId })),
    {
      onConflict: "session_id,lot_id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw new Error(
      `[favorites] Failed to add anonymous favorites: ${error.message}`,
    );
  }

  return listAnonymousFavoriteLotIds(sessionId);
}

export async function removeAnonymousFavorite(sessionId: string, lotId: number) {
  if (sessionId.trim().length === 0) {
    throw new Error("Invalid sessionId");
  }

  if (!Number.isInteger(lotId) || lotId <= 0) {
    throw new Error("Invalid lotId");
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("auc_anonymous_favorites")
    .delete()
    .eq("session_id", sessionId)
    .eq("lot_id", lotId);

  if (error) {
    throw new Error(
      `[favorites] Failed to remove anonymous favorite: ${error.message}`,
    );
  }

  return listAnonymousFavoriteLotIds(sessionId);
}

export async function consumeAnonymousFavoritesIntoUser(
  userId: string,
  sessionId: string,
) {
  if (userId.trim().length === 0 || sessionId.trim().length === 0) {
    return [];
  }

  const anonymousLotIds = await listAnonymousFavoriteLotIds(sessionId);

  if (anonymousLotIds.length === 0) {
    return [];
  }

  await addUserFavorites(userId, anonymousLotIds);

  const supabase = createServerClient();
  const { error } = await supabase
    .from("auc_anonymous_favorites")
    .delete()
    .eq("session_id", sessionId);

  if (error) {
    throw new Error(
      `[favorites] Failed to clear anonymous favorites: ${error.message}`,
    );
  }

  return anonymousLotIds;
}