import { createServerClient } from "@/lib/supabase";

function normalizeLotIds(lotIds: number[]) {
  return Array.from(
    new Set(lotIds.filter((lotId) => Number.isInteger(lotId) && lotId > 0)),
  );
}

export async function listUserFavoriteLotIds(userId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_user_favorites")
    .select("lot_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`[favorites] Failed to list favorites: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => Number(row.lot_id))
    .filter((lotId) => Number.isInteger(lotId) && lotId > 0);
}

export async function addUserFavorites(userId: string, lotIds: number[]) {
  const normalizedLotIds = normalizeLotIds(lotIds);

  if (normalizedLotIds.length === 0) {
    return listUserFavoriteLotIds(userId);
  }

  const supabase = createServerClient();
  const { error } = await supabase.from("auc_user_favorites").upsert(
    normalizedLotIds.map((lotId) => ({ user_id: userId, lot_id: lotId })),
    {
      onConflict: "user_id,lot_id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw new Error(`[favorites] Failed to add favorites: ${error.message}`);
  }

  return listUserFavoriteLotIds(userId);
}

export async function removeUserFavorite(userId: string, lotId: number) {
  if (!Number.isInteger(lotId) || lotId <= 0) {
    throw new Error("Invalid lotId");
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("auc_user_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("lot_id", lotId);

  if (error) {
    throw new Error(`[favorites] Failed to remove favorite: ${error.message}`);
  }

  return listUserFavoriteLotIds(userId);
}
