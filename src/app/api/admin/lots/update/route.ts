import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessAdmin } from "@/lib/app-users";
import { regenerateEmbeddings } from "@/lib/embedding-ingester";
import { enrichSubjectTagsForLotIds } from "@/lib/subject-enricher";
import { generateDescriptionsForLotIds } from "@/lib/vision-describer";

type UpdateTask = "subjects" | "vision" | "embedding";

function isUpdateTask(value: string): value is UpdateTask {
  return value === "subjects" || value === "vision" || value === "embedding";
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !canAccessAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    lotIds?: unknown;
    tasks?: unknown;
  };

  const lotIds = Array.isArray(body.lotIds)
    ? body.lotIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];

  const tasks = Array.isArray(body.tasks)
    ? body.tasks.filter(
        (value): value is UpdateTask =>
          typeof value === "string" && isUpdateTask(value),
      )
    : [];

  if (lotIds.length === 0) {
    return NextResponse.json({ error: "No lots selected" }, { status: 400 });
  }

  if (tasks.length === 0) {
    return NextResponse.json({ error: "No tasks selected" }, { status: 400 });
  }

  const results: Record<string, unknown> = {};

  if (tasks.includes("subjects")) {
    results.subjects = await enrichSubjectTagsForLotIds(lotIds);
  }

  if (tasks.includes("vision")) {
    results.vision = await generateDescriptionsForLotIds(lotIds);
  }

  if (tasks.includes("embedding")) {
    results.embedding = await regenerateEmbeddings(lotIds);
  }

  return NextResponse.json({ ok: true, results });
}
