import { NextRequest, NextResponse } from "next/server";
import { executeRAG } from "@/lib/rag";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import type { RAGRequest } from "@/lib/rag";

/** 10 requests per minute per IP (RAG is expensive — Gemini calls) */
const RATE_LIMIT_CONFIG = { maxRequests: 10, windowMs: 60_000 };

/**
 * POST /api/rag
 *
 * Natural language auction search using RAG pipeline.
 * Combines vector similarity + fulltext search + Gemini generation.
 *
 * Body: { query, categories?, city?, minPrice?, maxPrice?, includeEnded? }
 */
export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = rateLimit(`rag:${ip}`, RATE_LIMIT_CONFIG);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      },
    );
  }

  try {
    const body = await request.json();

    if (!body.query?.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const ragRequest: RAGRequest = {
      query: body.query.trim(),
      categories: body.categories,
      city: body.city,
      minPrice: body.minPrice,
      maxPrice: body.maxPrice,
      includeEnded: body.includeEnded ?? false,
    };

    const result = await executeRAG(ragRequest);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/rag] Error:", error);

    return NextResponse.json(
      {
        error: "RAG pipeline failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export const maxDuration = 30; // seconds — allows for embedding + generation
