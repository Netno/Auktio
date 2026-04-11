import { NextRequest, NextResponse } from "next/server";
import { generateMissingSubjectTags } from "@/lib/subject-enricher";
import { maxDuration, verifyIngestAuthorization } from "../_shared";

export async function POST(request: NextRequest) {
  const unauthorizedResponse = verifyIngestAuthorization(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    const result = await generateMissingSubjectTags();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[api/ingest/subjects] Fatal error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export { maxDuration };
