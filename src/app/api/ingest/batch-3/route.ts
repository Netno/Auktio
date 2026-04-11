import { NextRequest } from "next/server";
import { handleIngestRoute, maxDuration } from "../_shared";

const BATCH_3_RANGE = {
  startIndex: 16,
  endIndexExclusive: 24,
};

export async function POST(request: NextRequest) {
  return handleIngestRoute(request, {
    sourceRange: BATCH_3_RANGE,
    runPostProcessing: false,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export { maxDuration };
