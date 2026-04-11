import { NextRequest } from "next/server";
import { handleIngestRoute, maxDuration } from "../_shared";

const BATCH_4_RANGE = {
  startIndex: 24,
};

export async function POST(request: NextRequest) {
  return handleIngestRoute(request, {
    sourceRange: BATCH_4_RANGE,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export { maxDuration };
