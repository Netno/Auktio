import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { createServerClient } from "@/lib/supabase";
import { getBootstrapRoleForEmail, mergeAuthProvider } from "@/lib/app-users";

const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_MIN_LENGTH = 8;
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;

const USER_SELECT =
  "id, email, name, auth_provider, google_subject, image_url, password_hash, password_set_at, email_verified_at, role, is_active, last_login_at, created_at, updated_at";

type AuthUserRow = {
  id: string;
  email: string;
  name: string | null;
  auth_provider: string;
  google_subject: string | null;
  image_url: string | null;
  password_hash: string | null;
  password_set_at: string | null;
  email_verified_at: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailAuthUser = {
  id: string;
  email: string;
  name: string | null;
  authProvider: string;
  passwordHash: string | null;
  emailVerifiedAt: string | null;
  isActive: boolean;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function mapEmailAuthUser(row: AuthUserRow): EmailAuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    authProvider: row.auth_provider,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at,
    isActive: row.is_active,
  };
}

function hashPassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error("Losenordet maste vara minst 8 tecken.");
  }

  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHash] = storedHash.split(":");

  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const derivedBuffer = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (derivedBuffer.byteLength !== expectedBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(derivedBuffer, expectedBuffer);
}

async function getEmailAuthUserByEmail(email: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_users")
    .select(USER_SELECT)
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (error) {
    throw new Error(`[email-auth] Failed to load user by email: ${error.message}`);
  }

  return data ? mapEmailAuthUser(data as AuthUserRow) : null;
}

export async function authenticateEmailUser(email: string, password: string) {
  const user = await getEmailAuthUserByEmail(email);

  if (!user || !user.passwordHash || !user.isActive) {
    return null;
  }

  if (!user.emailVerifiedAt) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const supabase = createServerClient();
  const { error } = await supabase
    .from("auc_users")
    .update({ last_login_at: nowIso, updated_at: nowIso })
    .eq("id", user.id);

  if (error) {
    throw new Error(`[email-auth] Failed to update last login: ${error.message}`);
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

export async function registerEmailUser(params: {
  email: string;
  name?: string | null;
  password: string;
}) {
  const supabase = createServerClient();
  const email = normalizeEmail(params.email);
  const passwordHash = hashPassword(params.password);
  const nowIso = new Date().toISOString();

  const { data: existing, error: existingError } = await supabase
    .from("auc_users")
    .select(USER_SELECT)
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    throw new Error(`[email-auth] Failed to check existing user: ${existingError.message}`);
  }

  const existingUser = existing as AuthUserRow | null;

  if (existingUser?.password_hash) {
    throw new Error("ACCOUNT_ALREADY_EXISTS");
  }

  if (existingUser) {
    const emailVerifiedAt =
      existingUser.email_verified_at ??
      (existingUser.google_subject ? nowIso : null);

    const { data, error } = await supabase
      .from("auc_users")
      .update({
        name: params.name ?? existingUser.name,
        password_hash: passwordHash,
        password_set_at: nowIso,
        email_verified_at: emailVerifiedAt,
        auth_provider: mergeAuthProvider(existingUser.auth_provider, "email"),
        updated_at: nowIso,
      })
      .eq("id", existingUser.id)
      .select(USER_SELECT)
      .single();

    if (error) {
      throw new Error(`[email-auth] Failed to update user for email auth: ${error.message}`);
    }

    return mapEmailAuthUser(data as AuthUserRow);
  }

  const { data, error } = await supabase
    .from("auc_users")
    .insert({
      id: randomUUID(),
      email,
      name: params.name ?? null,
      auth_provider: "email",
      password_hash: passwordHash,
      password_set_at: nowIso,
      email_verified_at: null,
      role: getBootstrapRoleForEmail(email),
      is_active: true,
      updated_at: nowIso,
    })
    .select(USER_SELECT)
    .single();

  if (error) {
    throw new Error(`[email-auth] Failed to create email user: ${error.message}`);
  }

  return mapEmailAuthUser(data as AuthUserRow);
}

export async function createEmailVerificationToken(userId: string, email: string) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString();
  const supabase = createServerClient();

  const { error } = await supabase.from("auc_user_email_verification_tokens").insert({
    user_id: userId,
    email: normalizeEmail(email),
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`[email-auth] Failed to create email verification token: ${error.message}`);
  }

  return token;
}

export async function verifyEmailToken(token: string) {
  const supabase = createServerClient();
  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("auc_user_email_verification_tokens")
    .select("id, user_id, expires_at, consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new Error(`[email-auth] Failed to load verification token: ${error.message}`);
  }

  if (!data || data.consumed_at || new Date(data.expires_at).getTime() < Date.now()) {
    return false;
  }

  const { error: updateUserError } = await supabase
    .from("auc_users")
    .update({ email_verified_at: nowIso, updated_at: nowIso })
    .eq("id", data.user_id);

  if (updateUserError) {
    throw new Error(`[email-auth] Failed to mark email verified: ${updateUserError.message}`);
  }

  const { error: consumeError } = await supabase
    .from("auc_user_email_verification_tokens")
    .update({ consumed_at: nowIso })
    .eq("id", data.id);

  if (consumeError) {
    throw new Error(`[email-auth] Failed to consume verification token: ${consumeError.message}`);
  }

  return true;
}

export async function createPasswordResetToken(email: string) {
  const user = await getEmailAuthUserByEmail(email);

  if (!user) {
    return null;
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();
  const supabase = createServerClient();

  const { error } = await supabase.from("auc_user_password_reset_tokens").insert({
    user_id: user.id,
    email: user.email,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`[email-auth] Failed to create password reset token: ${error.message}`);
  }

  return { token, email: user.email };
}

export async function resetPasswordWithToken(token: string, password: string) {
  const supabase = createServerClient();
  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("auc_user_password_reset_tokens")
    .select("id, user_id, expires_at, consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new Error(`[email-auth] Failed to load password reset token: ${error.message}`);
  }

  if (!data || data.consumed_at || new Date(data.expires_at).getTime() < Date.now()) {
    return false;
  }

  const passwordHash = hashPassword(password);

  const { data: existingUser, error: existingUserError } = await supabase
    .from("auc_users")
    .select("auth_provider")
    .eq("id", data.user_id)
    .maybeSingle();

  if (existingUserError) {
    throw new Error(`[email-auth] Failed to load user during password reset: ${existingUserError.message}`);
  }

  const { error: updateUserError } = await supabase
    .from("auc_users")
    .update({
      password_hash: passwordHash,
      password_set_at: nowIso,
      auth_provider: mergeAuthProvider(existingUser?.auth_provider, "email"),
      updated_at: nowIso,
    })
    .eq("id", data.user_id);

  if (updateUserError) {
    throw new Error(`[email-auth] Failed to reset password: ${updateUserError.message}`);
  }

  const { error: consumeError } = await supabase
    .from("auc_user_password_reset_tokens")
    .update({ consumed_at: nowIso })
    .eq("id", data.id);

  if (consumeError) {
    throw new Error(`[email-auth] Failed to consume password reset token: ${consumeError.message}`);
  }

  return true;
}

export async function recordAuthRateLimitAttempt(params: {
  action: string;
  identifier: string;
  maxAttempts: number;
  windowMs: number;
}) {
  const identifier = params.identifier.trim().toLowerCase();

  if (!identifier) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const supabase = createServerClient();
  const windowStartIso = new Date(Date.now() - params.windowMs).toISOString();
  const { count, error: countError } = await supabase
    .from("auc_auth_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("action", params.action)
    .eq("identifier", identifier)
    .gte("created_at", windowStartIso);

  if (countError) {
    throw new Error(`[email-auth] Failed to read auth rate limit: ${countError.message}`);
  }

  if ((count ?? 0) >= params.maxAttempts) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(params.windowMs / 1000),
    };
  }

  const { error: insertError } = await supabase.from("auc_auth_rate_limits").insert({
    action: params.action,
    identifier,
  });

  if (insertError) {
    throw new Error(`[email-auth] Failed to write auth rate limit: ${insertError.message}`);
  }

  return { allowed: true, retryAfterSeconds: 0 };
}