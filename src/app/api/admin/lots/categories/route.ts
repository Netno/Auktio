import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessAdmin } from "@/lib/app-users";
import {
  recategorizeLotWithAi,
  updateLotCategoryFromAdmin,
} from "@/lib/admin-category-review";

type AdminCategoryAction = "set" | "reclassify";

function getSessionUserId(
  session:
    | {
        user?: {
          id?: string | null;
          role?: string | null;
        };
      }
    | null
    | undefined,
) {
  return typeof session?.user?.id === "string" ? session.user.id : null;
}

function isAdminCategoryAction(value: unknown): value is AdminCategoryAction {
  return value === "set" || value === "reclassify";
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !canAccessAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action?: unknown;
    lotId?: unknown;
    categories?: unknown;
    note?: unknown;
  };

  if (!isAdminCategoryAction(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const lotId = Number(body.lotId);
  if (!Number.isInteger(lotId) || lotId <= 0) {
    return NextResponse.json({ error: "Invalid lotId" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note : null;
  const userId = getSessionUserId(session);

  try {
    if (body.action === "set") {
      const categories = Array.isArray(body.categories)
        ? body.categories.map((value) => String(value))
        : [];
      const result = await updateLotCategoryFromAdmin({
        lotId,
        categories,
        userId,
        note,
      });

      return NextResponse.json({ ok: true, ...result });
    }

    const result = await recategorizeLotWithAi({
      lotId,
      userId,
      note,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kategoriuppdateringen misslyckades",
      },
      { status: 500 },
    );
  }
}
