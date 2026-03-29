import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import {
  canAccessAdmin,
  isAppUserRole,
  updateAppUserRole,
} from "@/lib/app-users";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !canAccessAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    userId?: unknown;
    role?: unknown;
  };

  if (typeof body.userId !== "string" || body.userId.trim().length === 0) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (!isAppUserRole(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const user = await updateAppUserRole(body.userId, body.role);

  return NextResponse.json({ ok: true, user });
}
