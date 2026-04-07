import { NextRequest, NextResponse } from "next/server";
import {
  createPasswordResetToken,
  recordAuthRateLimitAttempt,
} from "@/lib/email-auth";
import { sendPasswordResetEmail } from "@/lib/auth-mailer";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const rateLimitIdentifier = `${request.ip ?? "unknown"}:${email.toLowerCase()}`;

  const rateLimit = await recordAuthRateLimitAttempt({
    action: "request_password_reset",
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

  if (!email) {
    return NextResponse.json({ ok: true });
  }

  try {
    const tokenPayload = await createPasswordResetToken(email);

    if (tokenPayload) {
      await sendPasswordResetEmail(tokenPayload);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
