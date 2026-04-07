import { createServerClient } from "@/lib/supabase";
import { isMissingSupabaseTableError } from "@/lib/supabase-table-errors";

export async function createSearchClickLog(params: {
  searchId: number;
  lotId: number;
  positionInResults: number;
}) {
  const supabase = createServerClient();

  const { error: insertError } = await supabase
    .from("auc_search_click_log")
    .insert({
      search_id: params.searchId,
      lot_id: params.lotId,
      position_in_results: params.positionInResults,
    });

  if (insertError) {
    if (isMissingSupabaseTableError(insertError, "auc_search_click_log")) {
      console.warn(
        "[search-click-log] Search click table is missing; skipping click log write.",
      );
      return;
    }

    throw new Error(
      `[search-click-log] Failed to create click log: ${insertError.message}`,
    );
  }

  const { data: searchLog, error: searchLogError } = await supabase
    .from("auc_user_search_log")
    .select("results_clicked, first_click_position")
    .eq("id", params.searchId)
    .single();

  if (searchLogError) {
    if (isMissingSupabaseTableError(searchLogError, "auc_user_search_log")) {
      console.warn(
        "[search-click-log] Search log table is missing; skipping parent search log update.",
      );
      return;
    }

    throw new Error(
      `[search-click-log] Failed to load parent search log: ${searchLogError.message}`,
    );
  }

  const nextResultsClicked =
    typeof searchLog.results_clicked === "number"
      ? searchLog.results_clicked + 1
      : 1;
  const currentFirstClickPosition =
    typeof searchLog.first_click_position === "number"
      ? searchLog.first_click_position
      : null;
  const nextFirstClickPosition =
    currentFirstClickPosition == null
      ? params.positionInResults
      : Math.min(currentFirstClickPosition, params.positionInResults);

  const { error: updateError } = await supabase
    .from("auc_user_search_log")
    .update({
      results_clicked: nextResultsClicked,
      first_click_position: nextFirstClickPosition,
    })
    .eq("id", params.searchId);

  if (updateError) {
    if (isMissingSupabaseTableError(updateError, "auc_user_search_log")) {
      console.warn(
        "[search-click-log] Search log table is missing; skipping parent search log update.",
      );
      return;
    }

    throw new Error(
      `[search-click-log] Failed to update parent search log: ${updateError.message}`,
    );
  }
}
