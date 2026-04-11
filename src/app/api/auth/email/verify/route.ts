import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/email-auth";

function buildCallbackUrl(request: NextRequest, status: "success" | "error") {
  const url = new URL("/auth/callback", request.url);
  url.searchParams.set("mode", "verify-email");
  url.searchParams.set("status", status);
  return url;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";

  if (!token) {
    return NextResponse.redirect(buildCallbackUrl(request, "error"));
  }

  try {
    const verified = await verifyEmailToken(token);
    return NextResponse.redirect(
      buildCallbackUrl(request, verified ? "success" : "error"),
    );
  } catch {
    return NextResponse.redirect(buildCallbackUrl(request, "error"));
  }
}
