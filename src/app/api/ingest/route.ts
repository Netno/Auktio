import { NextRequest } from "next/server";
import { handleIngestRoute, maxDuration } from "./_shared";

export async function POST(request: NextRequest) {
  return handleIngestRoute(request);
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export { maxDuration };
