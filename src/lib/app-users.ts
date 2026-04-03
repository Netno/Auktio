import { randomUUID } from "crypto";
import { createServerClient } from "./supabase";

export const APP_USER_ROLES = ["user", "admin", "owner"] as const;

export type AppUserRole = (typeof APP_USER_ROLES)[number];

type AppUserRow = {
  id: string;
  email: string;
  name: string | null;
  auth_provider: string;
  google_subject: string | null;
  image_url: string | null;
  role: AppUserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  authProvider: string;
  googleSubject: string | null;
  imageUrl: string | null;
  role: AppUserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mergeAuthProvider(
  existingProvider: string | null | undefined,
  nextProvider: "google" | "email",
) {
  const existingParts = (existingProvider ?? "")
    .split("+")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!existingParts.includes(nextProvider)) {
    existingParts.push(nextProvider);
  }

  const orderedProviders = ["google", "email"].filter((provider) =>
    existingParts.includes(provider),
  );

  return orderedProviders.length > 0 ? orderedProviders.join("+") : nextProvider;
}

function mapAppUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    authProvider: row.auth_provider,
    googleSubject: row.google_subject,
    imageUrl: row.image_url,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getBootstrapRoleForEmail(email: string): AppUserRole {
  const normalizedEmail = normalizeEmail(email);
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(normalizedEmail) ? "admin" : "user";
}

function isMissingUsersTableError(
  error: { message?: string } | null | undefined,
) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    message.includes("public.auc_users") ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes('relation "auc_users" does not exist')
  );
}

function buildFallbackUser(params: {
  email: string;
  name?: string | null;
  imageUrl?: string | null;
  googleSubject?: string | null;
}): AppUser {
  const nowIso = new Date().toISOString();

  return {
    id: params.googleSubject ?? normalizeEmail(params.email),
    email: normalizeEmail(params.email),
    name: params.name ?? null,
    authProvider: "google",
    googleSubject: params.googleSubject ?? null,
    imageUrl: params.imageUrl ?? null,
    role: getBootstrapRoleForEmail(params.email),
    isActive: true,
    lastLoginAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function isAppUserRole(value: unknown): value is AppUserRole {
  return (
    typeof value === "string" && APP_USER_ROLES.includes(value as AppUserRole)
  );
}

export function canAccessAdmin(role: unknown) {
  return role === "admin" || role === "owner";
}

export async function getAppUserByEmail(email: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_users")
    .select(
      "id, email, name, auth_provider, google_subject, image_url, role, is_active, last_login_at, created_at, updated_at",
    )
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (error) {
    if (isMissingUsersTableError(error)) {
      return null;
    }

    throw new Error(
      `[app-users] Failed to load user by email: ${error.message}`,
    );
  }

  return data ? mapAppUser(data as AppUserRow) : null;
}

export async function syncGoogleUser(params: {
  email: string;
  name?: string | null;
  imageUrl?: string | null;
  googleSubject: string;
}) {
  const supabase = createServerClient();
  const email = normalizeEmail(params.email);
  const nowIso = new Date().toISOString();

  const { data: existingByGoogle, error: existingByGoogleError } =
    await supabase
      .from("auc_users")
      .select(
        "id, email, name, auth_provider, google_subject, image_url, role, is_active, last_login_at, created_at, updated_at",
      )
      .eq("google_subject", params.googleSubject)
      .maybeSingle();

  if (existingByGoogleError) {
    if (isMissingUsersTableError(existingByGoogleError)) {
      return buildFallbackUser({
        email,
        name: params.name,
        imageUrl: params.imageUrl,
        googleSubject: params.googleSubject,
      });
    }

    throw new Error(
      `[app-users] Failed to load user by Google subject: ${existingByGoogleError.message}`,
    );
  }

  let existing = existingByGoogle as AppUserRow | null;

  if (!existing) {
    const { data: existingByEmail, error: existingByEmailError } =
      await supabase
        .from("auc_users")
        .select(
          "id, email, name, auth_provider, google_subject, image_url, role, is_active, last_login_at, created_at, updated_at",
        )
        .eq("email", email)
        .maybeSingle();

    if (existingByEmailError) {
      if (isMissingUsersTableError(existingByEmailError)) {
        return buildFallbackUser({
          email,
          name: params.name,
          imageUrl: params.imageUrl,
          googleSubject: params.googleSubject,
        });
      }

      throw new Error(
        `[app-users] Failed to load user by email: ${existingByEmailError.message}`,
      );
    }

    existing = existingByEmail as AppUserRow | null;
  }

  if (existing) {
    const bootstrapRole = getBootstrapRoleForEmail(email);
    const { data, error } = await supabase
      .from("auc_users")
      .update({
        email,
        name: params.name ?? existing.name,
        image_url: params.imageUrl ?? existing.image_url,
        google_subject: params.googleSubject,
        auth_provider: mergeAuthProvider(existing.auth_provider, "google"),
        role: existing.role === "user" ? bootstrapRole : existing.role,
        last_login_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", existing.id)
      .select(
        "id, email, name, auth_provider, google_subject, image_url, role, is_active, last_login_at, created_at, updated_at",
      )
      .single();

    if (error) {
      throw new Error(`[app-users] Failed to update user: ${error.message}`);
    }

    return mapAppUser(data as AppUserRow);
  }

  const { data, error } = await supabase
    .from("auc_users")
    .insert({
      id: randomUUID(),
      email,
      name: params.name ?? null,
      auth_provider: "google",
      google_subject: params.googleSubject,
      image_url: params.imageUrl ?? null,
      role: getBootstrapRoleForEmail(email),
      is_active: true,
      last_login_at: nowIso,
      updated_at: nowIso,
    })
    .select(
      "id, email, name, auth_provider, google_subject, image_url, role, is_active, last_login_at, created_at, updated_at",
    )
    .single();

  if (error) {
    if (isMissingUsersTableError(error)) {
      return buildFallbackUser({
        email,
        name: params.name,
        imageUrl: params.imageUrl,
        googleSubject: params.googleSubject,
      });
    }

    throw new Error(`[app-users] Failed to create user: ${error.message}`);
  }

  return mapAppUser(data as AppUserRow);
}

export async function listAppUsers(limit = 200) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_users")
    .select(
      "id, email, name, auth_provider, google_subject, image_url, role, is_active, last_login_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingUsersTableError(error)) {
      return [];
    }

    throw new Error(`[app-users] Failed to list users: ${error.message}`);
  }

  return ((data ?? []) as AppUserRow[]).map(mapAppUser);
}

export async function updateAppUserRole(userId: string, role: AppUserRole) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select(
      "id, email, name, auth_provider, google_subject, image_url, role, is_active, last_login_at, created_at, updated_at",
    )
    .single();

  if (error) {
    if (isMissingUsersTableError(error)) {
      throw new Error(
        "auc_users saknas i databasen. Kör SQL-migreringen i Supabase först.",
      );
    }

    throw new Error(`[app-users] Failed to update role: ${error.message}`);
  }

  return mapAppUser(data as AppUserRow);
}
