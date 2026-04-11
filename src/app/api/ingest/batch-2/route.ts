import { NextRequest } from "next/server";
import { handleIngestRoute, maxDuration } from "../_shared";

const BATCH_2_RANGE = {
  startIndex: 8,
  endIndexExclusive: 16,
};

export async function POST(request: NextRequest) {
  return handleIngestRoute(request, {
    sourceRange: BATCH_2_RANGE,
    runPostProcessing: false,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export { maxDuration };
