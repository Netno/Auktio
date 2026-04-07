import { createServerClient } from "@/lib/supabase";
import { isMissingSupabaseTableError } from "@/lib/supabase-table-errors";
import {
  DEFAULT_USER_NOTIFICATION_SETTINGS,
  normalizeNotificationSettingsInput,
  type UpdateNotificationSettingsInput,
  type UserNotificationSettings,
} from "@/lib/mina-sidor";

type NotificationSettingsRow = {
  email_enabled: boolean;
  digest_frequency: UserNotificationSettings["digestFrequency"];
  instant_enabled: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  max_notifications_per_day: number;
  updated_at: string | null;
};

function mapRow(row: NotificationSettingsRow | null): UserNotificationSettings {
  if (!row) {
    return DEFAULT_USER_NOTIFICATION_SETTINGS;
  }

  return {
    emailEnabled: row.email_enabled,
    digestFrequency: row.digest_frequency,
    instantEnabled: row.instant_enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    maxNotificationsPerDay: row.max_notifications_per_day,
    updatedAt: row.updated_at,
  };
}

export async function getUserNotificationSettings(
  userId: string,
): Promise<UserNotificationSettings> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_user_notification_settings")
    .select(
      "email_enabled, digest_frequency, instant_enabled, quiet_hours_start, quiet_hours_end, max_notifications_per_day, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle<NotificationSettingsRow>();

  if (error) {
    if (isMissingSupabaseTableError(error, "auc_user_notification_settings")) {
      return DEFAULT_USER_NOTIFICATION_SETTINGS;
    }

    throw error;
  }

  return mapRow(data);
}

export async function updateUserNotificationSettings(
  userId: string,
  input: UpdateNotificationSettingsInput,
): Promise<UserNotificationSettings> {
  const supabase = createServerClient();
  const current = await getUserNotificationSettings(userId);
  const normalized = normalizeNotificationSettingsInput(input);

  const payload = {
    user_id: userId,
    email_enabled: normalized.emailEnabled ?? current.emailEnabled,
    digest_frequency: normalized.digestFrequency ?? current.digestFrequency,
    instant_enabled: normalized.instantEnabled ?? current.instantEnabled,
    quiet_hours_start:
      normalized.quietHoursStart === undefined
        ? current.quietHoursStart
        : normalized.quietHoursStart,
    quiet_hours_end:
      normalized.quietHoursEnd === undefined
        ? current.quietHoursEnd
        : normalized.quietHoursEnd,
    max_notifications_per_day:
      normalized.maxNotificationsPerDay ?? current.maxNotificationsPerDay,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("auc_user_notification_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "email_enabled, digest_frequency, instant_enabled, quiet_hours_start, quiet_hours_end, max_notifications_per_day, updated_at",
    )
    .single<NotificationSettingsRow>();

  if (error) {
    throw error;
  }

  return mapRow(data);
}
