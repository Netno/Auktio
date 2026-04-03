import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { ANONYMOUS_SESSION_COOKIE_NAME } from "@/lib/anonymous-session";
import { createSearchLog, isSearchLogSource } from "@/lib/search-log";

function getSessionUserId(
  session:
    | {
        user?: {
          id?: string | null;
        };
      }
    | null
    | undefined,
) {
  const userId = session?.user?.id;
  return typeof userId === "string" && userId.trim().length > 0 ? userId : null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  const sessionId = request.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)?.value ?? null;
  const body = (await request.json()) as {
    queryText?: unknown;
    selectedCategories?: unknown;
    filtersApplied?: unknown;
    resultCount?: unknown;
    source?: unknown;
  };

  if (!isSearchLogSource(body.source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const queryText = typeof body.queryText === "string" ? body.queryText : null;
  const selectedCategories = Array.isArray(body.selectedCategories)
    ? body.selectedCategories.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const filtersApplied =
    body.filtersApplied &&
    typeof body.filtersApplied === "object" &&
    !Array.isArray(body.filtersApplied)
      ? (body.filtersApplied as Record<string, unknown>)
      : {};
  const resultCount =
    typeof body.resultCount === "number" ? body.resultCount : undefined;

  if (!queryText?.trim() && selectedCategories.length === 0) {
    return NextResponse.json(
      { error: "Missing query or category selection" },
      { status: 400 },
    );
  }

  try {
    const result = await createSearchLog({
      userId,
      sessionId,
      queryText,
      selectedCategories,
      filtersApplied,
      resultCount,
      source: body.source,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create search log",
      },
      { status: 500 },
    );
  }
}