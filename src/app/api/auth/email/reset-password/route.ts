import { NextRequest, NextResponse } from "next/server";
import {
  recordAuthRateLimitAttempt,
  resetPasswordWithToken,
} from "@/lib/email-auth";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    token?: unknown;
    password?: unknown;
  };

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const rateLimit = await recordAuthRateLimitAttempt({
    action: "reset_password",
    identifier: `${request.ip ?? "unknown"}:${token.slice(0, 12)}`,
    maxAttempts: 8,
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

  if (!token || !password) {
    return NextResponse.json({ error: "Missing token or password" }, { status: 400 });
  }

  try {
    const reset = await resetPasswordWithToken(token, password);

    if (!reset) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Password reset failed",
      },
      { status: 500 },
    );
  }
}