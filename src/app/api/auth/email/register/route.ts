import { NextRequest, NextResponse } from "next/server";
import {
  createEmailVerificationToken,
  recordAuthRateLimitAttempt,
  registerEmailUser,
} from "@/lib/email-auth";
import { sendEmailVerificationEmail } from "@/lib/auth-mailer";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: unknown;
    name?: unknown;
    password?: unknown;
  };

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const rateLimitIdentifier = `${request.ip ?? "unknown"}:${email.toLowerCase()}`;

  const rateLimit = await recordAuthRateLimitAttempt({
    action: "register_email",
    identifier: rateLimitIdentifier,
    maxAttempts: 5,
    windowMs: 1000 * 60 * 15,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "For manga forsok. Forsok igen senare." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
  }

  try {
    const user = await registerEmailUser({
      email,
      name: name || null,
      password,
    });

    if (!user.emailVerifiedAt) {
      const token = await createEmailVerificationToken(user.id, user.email);
      await sendEmailVerificationEmail({ email: user.email, token });
    }

    return NextResponse.json({
      ok: true,
      emailVerificationRequired: !user.emailVerifiedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    const status = message === "ACCOUNT_ALREADY_EXISTS" ? 409 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}