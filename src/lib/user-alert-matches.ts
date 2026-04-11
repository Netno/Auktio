import { createServerClient } from "@/lib/supabase";
import { buildRuleDrivenMatches } from "@/lib/recommendation-rule-engine";

type ExistingAlertRow = {
  id: number;
  rule_id: number;
  lot_id: number;
  match_kind: string;
  delivery_state: "pending" | "seen" | "dismissed" | "notified";
  first_seen_at: string | null;
  notified_at: string | null;
};

function buildKey(ruleId: number, lotId: number, matchKind: string) {
  return `${ruleId}:${lotId}:${matchKind}`;
}

export async function refreshUserAlertMatches(userId: string) {
  const supabase = createServerClient();
  const matches = await buildRuleDrivenMatches({
    userId,
    surface: "notification",
    perRuleLimit: 14,
    totalLimit: 80,
  });

  const ruleIds = Array.from(new Set(matches.map((match) => match.ruleId)));

  if (!ruleIds.length) {
    const { error } = await supabase
      .from("auc_user_alert_matches")
      .delete()
      .eq("user_id", userId)
      .eq("delivery_state", "pending");

    if (error) {
      throw new Error(
        `[alert-matches] Failed to clear pending alerts: ${error.message}`,
      );
    }

    return { matchCount: 0 };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("auc_user_alert_matches")
    .select(
      "id, rule_id, lot_id, match_kind, delivery_state, first_seen_at, notified_at",
    )
    .eq("user_id", userId)
    .in("rule_id", ruleIds)
    .returns<ExistingAlertRow[]>();

  if (existingError) {
    throw new Error(
      `[alert-matches] Failed to load existing alert matches: ${existingError.message}`,
    );
  }

  const existingByKey = new Map(
    (existingRows ?? []).map((row) => [
      buildKey(row.rule_id, row.lot_id, row.match_kind),
      row,
    ]),
  );
  const keepKeys = new Set<string>();
  const nowIso = new Date().toISOString();

  const rowsToUpsert = matches.map((match) => {
    const key = buildKey(match.ruleId, match.lotId, match.matchKind);
    keepKeys.add(key);
    const existing = existingByKey.get(key);

    return {
      user_id: userId,
      rule_id: match.ruleId,
      lot_id: match.lotId,
      match_kind: match.matchKind,
      reason_codes: match.reasonCodes,
      score: match.score,
      score_breakdown: match.scoreBreakdown,
      delivery_state:
        existing?.delivery_state === "dismissed"
          ? "dismissed"
          : existing?.delivery_state === "seen"
            ? "seen"
            : existing?.delivery_state === "notified"
              ? "notified"
              : "pending",
      first_seen_at: existing?.first_seen_at ?? nowIso,
      last_seen_at: nowIso,
      notified_at: existing?.notified_at ?? null,
    };
  });

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("auc_user_alert_matches")
      .upsert(rowsToUpsert, {
        onConflict: "user_id,rule_id,lot_id,match_kind",
      });

    if (upsertError) {
      throw new Error(
        `[alert-matches] Failed to upsert alert matches: ${upsertError.message}`,
      );
    }
  }

  const stalePendingIds = (existingRows ?? [])
    .filter(
      (row) =>
        row.delivery_state === "pending" &&
        !keepKeys.has(buildKey(row.rule_id, row.lot_id, row.match_kind)),
    )
    .map((row) => row.id);

  if (stalePendingIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("auc_user_alert_matches")
      .delete()
      .in("id", stalePendingIds);

    if (deleteError) {
      throw new Error(
        `[alert-matches] Failed to clear stale pending alerts: ${deleteError.message}`,
      );
    }
  }

  return { matchCount: rowsToUpsert.length };
}
