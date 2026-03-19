import { NextRequest, NextResponse } from "next/server";
import { FEED_SOURCES } from "@/config/sources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const imageCache = new Map<
  string,
  { expiresAt: number; imageUrl: string | null }
>();

const allowedHosts = new Set(
  FEED_SOURCES.flatMap((source) => {
    const hosts: string[] = [];

    for (const candidate of [source.websiteUrl, source.feedUrl]) {
      if (!candidate) {
        continue;
      }

      try {
        hosts.push(new URL(candidate).hostname);
      } catch {
        // Ignore malformed source URLs.
      }
    }

    return hosts;
  }),
);

function extractImageUrl(html: string, lotUrl: string) {
  const inventoryId = (() => {
    try {
      const url = new URL(lotUrl);
      const match = url.pathname.match(/\/inventories\/(\d+)/i);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  })();

  const metaMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  );

  if (metaMatch?.[1]) {
    return metaMatch[1];
  }

  const matches = Array.from(
    html.matchAll(/https:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp)/gi),
  ).map((match) => match[0]);

  const uniqueMatches = Array.from(new Set(matches));
  const sortedMatches = uniqueMatches.sort((left, right) => {
    const score = (value: string) => {
      const inventoryScore =
        inventoryId && value.includes(`/${inventoryId}-itemimages/`) ? 10 : 0;
      const sizeScore = /_med\./i.test(value)
        ? 3
        : /_lg\./i.test(value)
          ? 2
          : /_sm\./i.test(value)
            ? 1
            : 0;

      return inventoryScore + sizeScore;
    };

    return score(right) - score(left);
  });

  return sortedMatches[0] ?? null;
}

function isAllowedLotUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const lotUrl = request.nextUrl.searchParams.get("lotUrl");

  if (!lotUrl || !isAllowedLotUrl(lotUrl)) {
    return NextResponse.json({ imageUrl: null }, { status: 400 });
  }

  const cached = imageCache.get(lotUrl);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ imageUrl: cached.imageUrl });
  }

  try {
    const response = await fetch(lotUrl, {
      headers: { Accept: "text/html,application/xhtml+xml" },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      imageCache.set(lotUrl, { expiresAt: now + CACHE_TTL_MS, imageUrl: null });
      return NextResponse.json({ imageUrl: null });
    }

    const html = await response.text();
    const imageUrl = extractImageUrl(html, lotUrl);
    imageCache.set(lotUrl, { expiresAt: now + CACHE_TTL_MS, imageUrl });

    return NextResponse.json({ imageUrl });
  } catch {
    imageCache.set(lotUrl, { expiresAt: now + CACHE_TTL_MS, imageUrl: null });
    return NextResponse.json({ imageUrl: null });
  }
}
