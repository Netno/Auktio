import { createServerClient } from "@/lib/supabase";

export type UserPreferenceSettings = {
  personalizationEnabled: boolean;
  searchHistoryEnabled: boolean;
  updatedAt: string | null;
};

const DEFAULT_USER_PREFERENCE_SETTINGS: UserPreferenceSettings = {
  personalizationEnabled: true,
  searchHistoryEnabled: true,
  updatedAt: null,
};

type UserPreferenceSettingsRow = {
  personalization_enabled: boolean | null;
  search_history_enabled: boolean | null;
  updated_at: string | null;
};

function mapUserPreferenceSettings(
  row: UserPreferenceSettingsRow | null,
): UserPreferenceSettings {
  if (!row) {
    return DEFAULT_USER_PREFERENCE_SETTINGS;
  }

  return {
    personalizationEnabled: row.personalization_enabled !== false,
    searchHistoryEnabled: row.search_history_enabled !== false,
    updatedAt: row.updated_at ?? null,
  };
}

export async function getUserPreferenceSettings(userId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_user_preference_settings")
    .select("personalization_enabled, search_history_enabled, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[user-preferences] Failed to load settings: ${error.message}`,
    );
  }

  return mapUserPreferenceSettings(data as UserPreferenceSettingsRow | null);
}

export async function updateUserPreferenceSettings(
  userId: string,
  input: Partial<
    Pick<
      UserPreferenceSettings,
      "personalizationEnabled" | "searchHistoryEnabled"
    >
  >,
) {
  const nowIso = new Date().toISOString();
  const supabase = createServerClient();
  const { error } = await supabase.from("auc_user_preference_settings").upsert(
    {
      user_id: userId,
      personalization_enabled: input.personalizationEnabled,
      search_history_enabled: input.searchHistoryEnabled,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(
      `[user-preferences] Failed to update settings: ${error.message}`,
    );
  }

  return getUserPreferenceSettings(userId);
}

export async function isPersonalizationEnabledForUser(userId: string) {
  const settings = await getUserPreferenceSettings(userId);
  return settings.personalizationEnabled;
}
