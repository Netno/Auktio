export const RECOMMENDATION_RULE_SURFACES = [
  "home",
  "notification",
  "both",
] as const;
export const RECOMMENDATION_RULE_STRICTNESS = ["strict", "blended"] as const;
export const NOTIFICATION_DIGEST_FREQUENCIES = ["off", "daily"] as const;
export const NOTIFICATION_MATCH_KINDS = [
  "rule_direct",
  "similar_to_saved",
  "followed_house",
  "price_fit",
  "returned_unsold",
] as const;

export type RecommendationRuleSurface =
  (typeof RECOMMENDATION_RULE_SURFACES)[number];
export type RecommendationRuleStrictness =
  (typeof RECOMMENDATION_RULE_STRICTNESS)[number];
export type NotificationDigestFrequency =
  (typeof NOTIFICATION_DIGEST_FREQUENCIES)[number];
export type NotificationMatchKind = (typeof NOTIFICATION_MATCH_KINDS)[number];
export type MinaSidorTab =
  | "overview"
  | "rules"
  | "notifications"
  | "profile"
  | "privacy";

export type UserNotificationSettings = {
  emailEnabled: boolean;
  digestFrequency: NotificationDigestFrequency;
  instantEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  maxNotificationsPerDay: number;
  updatedAt: string | null;
};

export type UserRecommendationRule = {
  id: number;
  label: string;
  surface: RecommendationRuleSurface;
  enabled: boolean;
  strictness: RecommendationRuleStrictness;
  queryText: string | null;
  categories: string[];
  excludedCategories: string[];
  brandsOrMakers: string[];
  houseIds: string[];
  minPrice: number | null;
  maxPrice: number | null;
  notificationTypes: string[];
  cooldownHours: number;
  priority: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateRecommendationRuleInput = {
  label?: string;
  surface?: RecommendationRuleSurface;
  enabled?: boolean;
  strictness?: RecommendationRuleStrictness;
  queryText?: string | null;
  categories?: string[];
  excludedCategories?: string[];
  brandsOrMakers?: string[];
  houseIds?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  notificationTypes?: string[];
  cooldownHours?: number;
  priority?: number;
};

export type UpdateRecommendationRuleInput =
  Partial<CreateRecommendationRuleInput>;

export type UpdateNotificationSettingsInput = Partial<
  Omit<UserNotificationSettings, "updatedAt">
>;

export type MinaSidorOverview = {
  activeRulesCount: number;
  notificationRuleCount: number;
  homeRuleCount: number;
  favoritesCount: number;
  recentSearchCount: number;
  recommendationMatchCount: number;
  pendingAlertCount: number;
};

export type MinaSidorProfileSummary = {
  topCategories: string[];
  priceMin: number | null;
  priceMax: number | null;
  updatedAt: string | null;
};

export type MinaSidorPayload = {
  preferences: {
    personalizationEnabled: boolean;
    searchHistoryEnabled: boolean;
    updatedAt: string | null;
  };
  notificationSettings: UserNotificationSettings;
  overview: MinaSidorOverview;
  recommendationRules: UserRecommendationRule[];
  profile: MinaSidorProfileSummary;
  recentSearches: Array<{
    id: number;
    query: string;
    resultCount: number | null;
    searchedAt: string | null;
  }>;
  availableCategories: string[];
  availableHouses: Array<{
    value: string;
    label: string;
    count: number;
  }>;
};

export const DEFAULT_USER_NOTIFICATION_SETTINGS: UserNotificationSettings = {
  emailEnabled: true,
  digestFrequency: "daily",
  instantEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  maxNotificationsPerDay: 6,
  updatedAt: null,
};

function clampHour(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  return Math.min(23, Math.max(0, Math.trunc(value)));
}

export function normalizeStringArray(values?: string[] | null): string[] {
  if (!values) {
    return [];
  }

  const normalized = values.map((value) => value.trim()).filter(Boolean);

  return Array.from(new Set(normalized));
}

export function createRuleLabel(input: CreateRecommendationRuleInput): string {
  const explicitLabel = input.label?.trim();

  if (explicitLabel) {
    return explicitLabel;
  }

  const queryText = input.queryText?.trim();
  if (queryText) {
    return queryText;
  }

  if (input.categories?.length) {
    return input.categories.slice(0, 2).join(" / ");
  }

  if (input.brandsOrMakers?.length) {
    return input.brandsOrMakers.slice(0, 2).join(" / ");
  }

  if (input.houseIds?.length) {
    return `Auktionshus: ${input.houseIds.slice(0, 2).join(", ")}`;
  }

  return "Ny bevakning";
}

export function normalizeNotificationSettingsInput(
  input: UpdateNotificationSettingsInput,
): UpdateNotificationSettingsInput {
  const digestFrequency = input.digestFrequency;

  return {
    emailEnabled: input.emailEnabled,
    digestFrequency:
      digestFrequency &&
      NOTIFICATION_DIGEST_FREQUENCIES.includes(digestFrequency)
        ? digestFrequency
        : undefined,
    instantEnabled: input.instantEnabled,
    quietHoursStart: clampHour(input.quietHoursStart),
    quietHoursEnd: clampHour(input.quietHoursEnd),
    maxNotificationsPerDay:
      input.maxNotificationsPerDay == null
        ? undefined
        : Math.max(0, Math.trunc(input.maxNotificationsPerDay)),
  };
}

export function normalizeRecommendationRuleInput(
  input: CreateRecommendationRuleInput,
): CreateRecommendationRuleInput {
  const surface =
    input.surface && RECOMMENDATION_RULE_SURFACES.includes(input.surface)
      ? input.surface
      : undefined;
  const strictness =
    input.strictness &&
    RECOMMENDATION_RULE_STRICTNESS.includes(input.strictness)
      ? input.strictness
      : undefined;

  const minPrice =
    input.minPrice == null ? null : Math.max(0, Number(input.minPrice));
  const maxPrice =
    input.maxPrice == null ? null : Math.max(0, Number(input.maxPrice));

  return {
    label: input.label?.trim() || undefined,
    surface,
    enabled: input.enabled,
    strictness,
    queryText: input.queryText?.trim() || null,
    categories: normalizeStringArray(input.categories),
    excludedCategories: normalizeStringArray(input.excludedCategories),
    brandsOrMakers: normalizeStringArray(input.brandsOrMakers),
    houseIds: normalizeStringArray(input.houseIds),
    minPrice,
    maxPrice,
    notificationTypes: normalizeStringArray(input.notificationTypes),
    cooldownHours:
      input.cooldownHours == null
        ? undefined
        : Math.max(0, Math.trunc(input.cooldownHours)),
    priority: input.priority == null ? undefined : Math.trunc(input.priority),
  };
}

export function assertRecommendationRuleHasSignal(
  input: CreateRecommendationRuleInput,
): void {
  if (
    input.queryText ||
    input.categories?.length ||
    input.brandsOrMakers?.length ||
    input.houseIds?.length
  ) {
    return;
  }

  throw new Error(
    "A recommendation rule must include a query, category, brand, or auction house.",
  );
}
