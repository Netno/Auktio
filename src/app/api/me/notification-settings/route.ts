import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth-options";
import {
  getUserNotificationSettings,
  updateUserNotificationSettings,
} from "@/lib/user-notification-settings";
import { type UpdateNotificationSettingsInput } from "@/lib/mina-sidor";
import { canAccessPersonalizationForSession } from "@/lib/recommendations-access";

async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!canAccessPersonalizationForSession(session)) {
    return null;
  }
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getUserNotificationSettings(userId);
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load notification settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as UpdateNotificationSettingsInput;
    const settings = await updateUserNotificationSettings(userId, body);

    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update notification settings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
