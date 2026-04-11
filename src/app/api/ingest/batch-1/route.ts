import { NextRequest } from "next/server";
import { handleIngestRoute, maxDuration } from "../_shared";

const BATCH_1_RANGE = {
  startIndex: 0,
  endIndexExclusive: 8,
};

export async function POST(request: NextRequest) {
  return handleIngestRoute(request, {
    sourceRange: BATCH_1_RANGE,
    runPostProcessing: false,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export { maxDuration };
