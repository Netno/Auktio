import { createServerClient } from "@/lib/supabase";
import { isMissingSupabaseTableError } from "@/lib/supabase-table-errors";
import {
  assertRecommendationRuleHasSignal,
  createRuleLabel,
  normalizeRecommendationRuleInput,
  type CreateRecommendationRuleInput,
  type UpdateRecommendationRuleInput,
  type UserRecommendationRule,
} from "@/lib/mina-sidor";

type RecommendationRuleRow = {
  id: number;
  label: string;
  surface: UserRecommendationRule["surface"];
  enabled: boolean;
  strictness: UserRecommendationRule["strictness"];
  query_text: string | null;
  categories: string[];
  excluded_categories: string[];
  brands_or_makers: string[];
  house_ids: string[];
  min_price: number | null;
  max_price: number | null;
  notification_types: string[];
  cooldown_hours: number;
  priority: number;
  created_at: string | null;
  updated_at: string | null;
};

function mapRow(row: RecommendationRuleRow): UserRecommendationRule {
  return {
    id: row.id,
    label: row.label,
    surface: row.surface,
    enabled: row.enabled,
    strictness: row.strictness,
    queryText: row.query_text,
    categories: row.categories ?? [],
    excludedCategories: row.excluded_categories ?? [],
    brandsOrMakers: row.brands_or_makers ?? [],
    houseIds: row.house_ids ?? [],
    minPrice: row.min_price,
    maxPrice: row.max_price,
    notificationTypes: row.notification_types ?? [],
    cooldownHours: row.cooldown_hours,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getExistingRule(
  userId: string,
  ruleId: number,
): Promise<UserRecommendationRule | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_user_recommendation_rules")
    .select(
      "id, label, surface, enabled, strictness, query_text, categories, excluded_categories, brands_or_makers, house_ids, min_price, max_price, notification_types, cooldown_hours, priority, created_at, updated_at",
    )
    .eq("user_id", userId)
    .eq("id", ruleId)
    .maybeSingle<RecommendationRuleRow>();

  if (error) {
    if (isMissingSupabaseTableError(error, "auc_user_recommendation_rules")) {
      return null;
    }

    throw error;
  }

  return data ? mapRow(data) : null;
}

export async function listUserRecommendationRules(
  userId: string,
): Promise<UserRecommendationRule[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_user_recommendation_rules")
    .select(
      "id, label, surface, enabled, strictness, query_text, categories, excluded_categories, brands_or_makers, house_ids, min_price, max_price, notification_types, cooldown_hours, priority, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .returns<RecommendationRuleRow[]>();

  if (error) {
    if (isMissingSupabaseTableError(error, "auc_user_recommendation_rules")) {
      return [];
    }

    throw error;
  }

  return data.map(mapRow);
}

export async function createUserRecommendationRule(
  userId: string,
  input: CreateRecommendationRuleInput,
): Promise<UserRecommendationRule> {
  const supabase = createServerClient();
  const normalized = normalizeRecommendationRuleInput(input);

  assertRecommendationRuleHasSignal(normalized);

  const { data, error } = await supabase
    .from("auc_user_recommendation_rules")
    .insert({
      user_id: userId,
      label: createRuleLabel(normalized),
      surface: normalized.surface ?? "both",
      enabled: normalized.enabled ?? true,
      strictness: normalized.strictness ?? "blended",
      query_text: normalized.queryText,
      categories: normalized.categories ?? [],
      excluded_categories: normalized.excludedCategories ?? [],
      brands_or_makers: normalized.brandsOrMakers ?? [],
      house_ids: normalized.houseIds ?? [],
      min_price: normalized.minPrice,
      max_price: normalized.maxPrice,
      notification_types: normalized.notificationTypes ?? [],
      cooldown_hours: normalized.cooldownHours ?? 24,
      priority: normalized.priority ?? 0,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, label, surface, enabled, strictness, query_text, categories, excluded_categories, brands_or_makers, house_ids, min_price, max_price, notification_types, cooldown_hours, priority, created_at, updated_at",
    )
    .single<RecommendationRuleRow>();

  if (error) {
    throw error;
  }

  return mapRow(data);
}

export async function updateUserRecommendationRule(
  userId: string,
  ruleId: number,
  input: UpdateRecommendationRuleInput,
): Promise<UserRecommendationRule> {
  const supabase = createServerClient();
  const existing = await getExistingRule(userId, ruleId);

  if (!existing) {
    throw new Error("Recommendation rule not found.");
  }

  const normalized = normalizeRecommendationRuleInput({
    label: input.label ?? existing.label,
    surface: input.surface ?? existing.surface,
    enabled: input.enabled ?? existing.enabled,
    strictness: input.strictness ?? existing.strictness,
    queryText:
      input.queryText === undefined ? existing.queryText : input.queryText,
    categories: input.categories ?? existing.categories,
    excludedCategories: input.excludedCategories ?? existing.excludedCategories,
    brandsOrMakers: input.brandsOrMakers ?? existing.brandsOrMakers,
    houseIds: input.houseIds ?? existing.houseIds,
    minPrice: input.minPrice === undefined ? existing.minPrice : input.minPrice,
    maxPrice: input.maxPrice === undefined ? existing.maxPrice : input.maxPrice,
    notificationTypes: input.notificationTypes ?? existing.notificationTypes,
    cooldownHours: input.cooldownHours ?? existing.cooldownHours,
    priority: input.priority ?? existing.priority,
  });

  assertRecommendationRuleHasSignal(normalized);

  const { data, error } = await supabase
    .from("auc_user_recommendation_rules")
    .update({
      label: normalized.label ?? existing.label,
      surface: normalized.surface ?? existing.surface,
      enabled: normalized.enabled ?? existing.enabled,
      strictness: normalized.strictness ?? existing.strictness,
      query_text: normalized.queryText,
      categories: normalized.categories ?? existing.categories,
      excluded_categories:
        normalized.excludedCategories ?? existing.excludedCategories,
      brands_or_makers: normalized.brandsOrMakers ?? existing.brandsOrMakers,
      house_ids: normalized.houseIds ?? existing.houseIds,
      min_price: normalized.minPrice,
      max_price: normalized.maxPrice,
      notification_types:
        normalized.notificationTypes ?? existing.notificationTypes,
      cooldown_hours: normalized.cooldownHours ?? existing.cooldownHours,
      priority: normalized.priority ?? existing.priority,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", ruleId)
    .select(
      "id, label, surface, enabled, strictness, query_text, categories, excluded_categories, brands_or_makers, house_ids, min_price, max_price, notification_types, cooldown_hours, priority, created_at, updated_at",
    )
    .single<RecommendationRuleRow>();

  if (error) {
    throw error;
  }

  return mapRow(data);
}

export async function deleteUserRecommendationRule(
  userId: string,
  ruleId: number,
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("auc_user_recommendation_rules")
    .delete()
    .eq("user_id", userId)
    .eq("id", ruleId);

  if (
    error &&
    !isMissingSupabaseTableError(error, "auc_user_recommendation_rules")
  ) {
    throw error;
  }
}
