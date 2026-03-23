import { createServerClient } from "./supabase";
import { FEED_SOURCES } from "../config/sources";
import { normalizeLotCategories } from "./category-normalization";
import { resolveCanonicalCategoriesForIngest } from "./canonical-category-review";
import type { FeedResponse, FeedLot, IngestResult } from "./types";
import { normalizeAuctionTitle } from "./utils";

const supabase = createServerClient();

/** Retry config */
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000; // exponential: 2s, 4s, 8s
const PRICE_BANK_LOOKBACK_DAYS = 365;
const SOLD_PRICE_SITE_LOOKBACK_DAYS = 30;
const SOLD_PRICE_SITE_BATCH_LIMIT = 250;
const SOLD_PRICE_READY_DELAY_HOURS = 24;

type IngestRunOptions = {
  syncFeed?: boolean;
  refreshSoldPrices?: boolean;
};

const DEFAULT_INGEST_RUN_OPTIONS: Required<IngestRunOptions> = {
  syncFeed: true,
  refreshSoldPrices: true,
};

type RecentEndedLotRow = {
  id: number;
  url: string | null;
  end_time: string | null;
  availability: string | null;
  current_bid: number | null;
  sold_price: number | null;
};

type ExistingLotState = {
  content_hash: string | null;
  categories: string[] | null;
};

/**
 * Ingest all configured feed sources.
 * Called by /api/ingest (Vercel Cron) or manually via `npm run ingest`.
 */
export async function ingestAllFeeds(): Promise<IngestResult[]> {
  return runIngestAcrossSources(DEFAULT_INGEST_RUN_OPTIONS);
}

export async function ingestFeedDataOnly(): Promise<IngestResult[]> {
  return runIngestAcrossSources({ syncFeed: true, refreshSoldPrices: false });
}

export async function refreshAllSoldPrices(): Promise<IngestResult[]> {
  return runIngestAcrossSources({ syncFeed: false, refreshSoldPrices: true });
}

async function runIngestAcrossSources(
  options: IngestRunOptions,
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  const resolvedOptions = { ...DEFAULT_INGEST_RUN_OPTIONS, ...options };

  for (const source of FEED_SOURCES) {
    console.log(`[ingest] Starting: ${source.name} (${source.id})`);
    const result = await ingestFeed(source.id, source.feedUrl, resolvedOptions);
    results.push(result);
    console.log(
      `[ingest] ${source.name}: +${result.lotsAdded} added, ~${result.lotsUpdated} updated, =${result.lotsSkipped ?? 0} skipped, ${result.soldPricesUpdated ?? 0} sold prices refreshed (${result.durationMs}ms)`,
    );
  }

  return results;
}

/**
 * Fetch with retry + exponential backoff.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on 5xx or 429
      if (
        (response.status >= 500 || response.status === 429) &&
        attempt < retries
      ) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[ingest] Fetch ${url} returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < retries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[ingest] Fetch ${url} failed: ${error instanceof Error ? error.message : error}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`,
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Fetch ${url} failed after ${retries} retries`);
}

/**
 * Compute a simple hash of the lot data that changes when content changes.
 * Used to skip re-upserting lots that haven't changed since last sync.
 */
function computeLotHash(lot: FeedLot): string {
  const normalizedCategories = normalizeLotCategories({
    rawCategories: lot.category,
    title: lot.title,
    description: lot.description,
  });
  const key = [
    lot.title,
    lot.price.bid ?? "",
    lot.price.amount ?? "",
    lot.price.estimate ?? "",
    lot.availability ?? "",
    lot.end,
    normalizedCategories.join(","),
  ].join("|");

  // Simple fast hash (djb2) — sufficient for change detection
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Ingest a single feed source.
 */
async function ingestFeed(
  houseId: string,
  feedUrl: string,
  options: IngestRunOptions = DEFAULT_INGEST_RUN_OPTIONS,
): Promise<IngestResult> {
  const startTime = Date.now();
  const resolvedOptions = { ...DEFAULT_INGEST_RUN_OPTIONS, ...options };

  try {
    // Ensure auction house exists
    await supabase.from("auc_auction_houses").upsert(
      {
        id: houseId,
        name: FEED_SOURCES.find((s) => s.id === houseId)?.name ?? houseId,
        feed_url: feedUrl,
        last_synced: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    let lotsAdded = 0;
    let lotsUpdated = 0;
    let lotsSkipped = 0;
    let soldPricesUpdated = 0;

    if (resolvedOptions.syncFeed) {
      // Fetch feed and upsert the current live data set.
      const response = await fetchWithRetry(feedUrl, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        throw new Error(
          `Feed returned ${response.status}: ${response.statusText}`,
        );
      }

      const feed: FeedResponse = await response.json();

      const allFeedLotIds = feed.auctions.flatMap((a) =>
        a.lots.map((l) => l.id),
      );
      const existingLotStates = await getExistingLotStates(allFeedLotIds);

      for (const auction of feed.auctions) {
        await supabase.from("auc_auctions").upsert(
          {
            id: auction.id,
            house_id: houseId,
            title: normalizeAuctionTitle(auction.title),
            description: auction.description,
            url: auction.url,
            is_live: auction.isLiveAuction,
            start_time: auction.start,
            end_time: auction.end,
            image_url: auction.image?.[0] ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );

        const changedLots: FeedLot[] = [];
        for (const lot of auction.lots) {
          const newHash = computeLotHash(lot);
          if (existingLotStates.get(lot.id)?.content_hash === newHash) {
            lotsSkipped++;
          } else {
            changedLots.push(lot);
          }
        }

        if (changedLots.length === 0) continue;

        const lotBatches = chunkArray(changedLots, 50);

        for (const batch of lotBatches) {
          const lotRows = batch.map((lot) => ({
            ...normalizeLot(
              lot,
              auction.id,
              houseId,
              existingLotStates.get(lot.id)?.categories,
            ),
            content_hash: computeLotHash(lot),
          }));

          const { error } = await supabase
            .from("auc_lots")
            .upsert(lotRows, { onConflict: "id" })
            .select("id");

          if (error) {
            console.error(
              `[ingest] Batch error for ${houseId}:`,
              error.message,
            );
            continue;
          }

          for (const lot of batch) {
            if (lot.price.bid != null) {
              await trackPriceChange(lot.id, lot.price.bid);
            }
          }

          for (const lot of batch) {
            if (existingLotStates.has(lot.id)) {
              lotsUpdated++;
            } else {
              lotsAdded++;
            }
          }
        }
      }
    }

    if (resolvedOptions.refreshSoldPrices) {
      soldPricesUpdated += await ingestPriceBankFeed(houseId, feedUrl);
      soldPricesUpdated += await refreshEndedLotsFromSite(houseId);
    }

    const result: IngestResult = {
      houseId,
      status: "success",
      lotsAdded,
      lotsUpdated,
      lotsSkipped,
      lotsRemoved: 0,
      soldPricesUpdated,
      durationMs: Date.now() - startTime,
    };

    // Log sync
    await supabase.from("auc_sync_log").insert({
      house_id: houseId,
      status: result.status,
      lots_added: result.lotsAdded,
      lots_updated: result.lotsUpdated,
      lots_skipped: result.lotsSkipped,
      lots_removed: result.lotsRemoved,
      duration_ms: result.durationMs,
    });

    return result;
  } catch (error) {
    const result: IngestResult = {
      houseId,
      status: "error",
      lotsAdded: 0,
      lotsUpdated: 0,
      lotsSkipped: 0,
      lotsRemoved: 0,
      soldPricesUpdated: 0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };

    await supabase.from("auc_sync_log").insert({
      house_id: houseId,
      status: "error",
      error_message: result.error,
      duration_ms: result.durationMs,
    });

    return result;
  }
}

/**
 * Load existing content hashes for given lot IDs to detect unchanged lots.
 */
async function getExistingLotStates(
  lotIds: number[],
): Promise<Map<number, ExistingLotState>> {
  const map = new Map<number, ExistingLotState>();
  if (lotIds.length === 0) return map;

  // Query in chunks of 500 (Supabase URL length limit)
  const chunks = chunkArray(lotIds, 500);
  for (const chunk of chunks) {
    const { data } = await supabase
      .from("auc_lots")
      .select("id, content_hash, categories")
      .in("id", chunk);
    for (const row of data ?? []) {
      map.set(row.id, {
        content_hash: row.content_hash ?? null,
        categories: row.categories ?? null,
      });
    }
  }
  return map;
}

async function getExistingLotsForPriceBank(
  houseId: string,
  lotIds: number[],
): Promise<
  Map<
    number,
    {
      auction_id: number;
      content_hash: string | null;
      sold_price: number | null;
      categories: string[] | null;
    }
  >
> {
  const map = new Map<
    number,
    {
      auction_id: number;
      content_hash: string | null;
      sold_price: number | null;
      categories: string[] | null;
    }
  >();

  if (lotIds.length === 0) return map;

  const chunks = chunkArray(lotIds, 500);
  for (const chunk of chunks) {
    const { data } = await supabase
      .from("auc_lots")
      .select("id, auction_id, content_hash, sold_price, categories")
      .eq("house_id", houseId)
      .in("id", chunk);

    for (const row of data ?? []) {
      map.set(row.id, {
        auction_id: row.auction_id,
        content_hash: row.content_hash,
        sold_price: row.sold_price,
        categories: row.categories ?? null,
      });
    }
  }

  return map;
}

async function ingestPriceBankFeed(houseId: string, feedUrl: string) {
  const priceBankUrl = buildPriceBankFeedUrl(feedUrl);

  try {
    const response = await fetchWithRetry(priceBankUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      console.warn(
        `[ingest] PriceBankFeed ${houseId} returned ${response.status}: ${response.statusText}`,
      );
      return 0;
    }

    const soldLots = (await response.json()) as FeedLot[];
    if (!Array.isArray(soldLots) || soldLots.length === 0) {
      return 0;
    }

    const existingLots = await getExistingLotsForPriceBank(
      houseId,
      soldLots.map((lot) => lot.id),
    );

    const changedRows = soldLots
      .map((lot) => {
        const existing = existingLots.get(lot.id);
        if (!existing) return null;

        const contentHash = computeLotHash(lot);
        const soldPrice = lot.price.amount ?? null;

        if (
          existing.content_hash === contentHash &&
          existing.sold_price === soldPrice
        ) {
          return null;
        }

        return {
          ...normalizeLot(
            lot,
            existing.auction_id,
            houseId,
            existing.categories,
          ),
          content_hash: contentHash,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    if (changedRows.length === 0) {
      return 0;
    }

    for (const batch of chunkArray(changedRows, 50)) {
      const { error } = await supabase
        .from("auc_lots")
        .upsert(batch, { onConflict: "id" });

      if (error) {
        console.error(
          `[ingest] PriceBankFeed batch error for ${houseId}:`,
          error.message,
        );
      }
    }

    return changedRows.length;
  } catch (error) {
    console.warn(
      `[ingest] PriceBankFeed failed for ${houseId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 0;
  }
}

function extractSoldOfferFromNextData(html: string) {
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i,
  );

  const payload = nextDataMatch?.[1]?.trim();
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload);
    const inventoryItem = parsed?.props?.pageProps?.inventoryItem;
    const soldFlag =
      inventoryItem?.sold === true ||
      inventoryItem?.state?.abbreviation === "Closed" ||
      inventoryItem?.state?.name === "Closed";

    const candidatePrices = [
      inventoryItem?.winInfo?.bidAmount,
      inventoryItem?.highBid,
      inventoryItem?.winInfo?.totalAmount,
    ].map((value: unknown) => Number(value));

    const soldPrice = candidatePrices.find((value) => Number.isFinite(value));

    if (!soldFlag || !Number.isFinite(soldPrice)) {
      return null;
    }

    return {
      soldPrice,
      isSold: true,
    };
  } catch {
    return null;
  }
}

function extractSoldOfferFromHtml(html: string) {
  const nextDataOffer = extractSoldOfferFromNextData(html);
  if (nextDataOffer) {
    return nextDataOffer;
  }

  const jsonLdMatches = Array.from(
    html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
    ),
  );

  for (const match of jsonLdMatches) {
    const payload = match[1]?.trim();
    if (!payload) continue;

    try {
      const parsed = JSON.parse(payload);
      const entries = Array.isArray(parsed) ? parsed : [parsed];

      for (const entry of entries) {
        const offer = entry?.offers;
        const price = Number(offer?.price);
        const availability = String(offer?.availability ?? "");

        if (!Number.isFinite(price)) continue;

        return {
          soldPrice: price,
          isSold:
            availability.includes("schema.org/SoldOut") ||
            availability.toLowerCase().includes("soldout"),
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function refreshEndedLotsFromSite(houseId: string) {
  const now = new Date();
  const fromDate = new Date(
    now.getTime() - SOLD_PRICE_SITE_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();
  const readyBefore = new Date(
    now.getTime() - SOLD_PRICE_READY_DELAY_HOURS * 3_600_000,
  ).toISOString();
  let updatedCount = 0;

  for (let offset = 0; ; offset += SOLD_PRICE_SITE_BATCH_LIMIT) {
    const { data, error } = await supabase
      .from("auc_lots")
      .select("id, url, end_time, availability, current_bid, sold_price")
      .eq("house_id", houseId)
      .gte("end_time", fromDate)
      .lte("end_time", readyBefore)
      .order("end_time", { ascending: false })
      .range(offset, offset + SOLD_PRICE_SITE_BATCH_LIMIT - 1);

    if (error) {
      console.warn(
        `[ingest] Site sold-price lookup failed for ${houseId}:`,
        error.message,
      );
      return updatedCount;
    }

    const candidates = ((data ?? []) as RecentEndedLotRow[]).filter((lot) =>
      Boolean(lot.url),
    );

    if (candidates.length === 0) {
      break;
    }

    for (const lot of candidates) {
      try {
        const response = await fetchWithRetry(lot.url!, {
          headers: { Accept: "text/html" },
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });

        if (!response.ok) {
          continue;
        }

        const html = await response.text();
        const offer = extractSoldOfferFromHtml(html);

        if (!offer?.isSold || !Number.isFinite(offer.soldPrice)) {
          continue;
        }

        if (
          lot.availability === "sold" &&
          lot.current_bid === offer.soldPrice &&
          lot.sold_price === offer.soldPrice
        ) {
          continue;
        }

        const { error: updateError } = await supabase
          .from("auc_lots")
          .update({
            availability: "sold",
            sold_price: offer.soldPrice,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lot.id);

        if (updateError) {
          console.warn(
            `[ingest] Site sold-price update failed for lot ${lot.id}:`,
            updateError.message,
          );
          continue;
        }

        updatedCount += 1;
      } catch (error) {
        console.warn(
          `[ingest] Site sold-price fetch failed for lot ${lot.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (candidates.length < SOLD_PRICE_SITE_BATCH_LIMIT) {
      break;
    }
  }

  return updatedCount;
}

function buildPriceBankFeedUrl(feedUrl: string) {
  const url = new URL(feedUrl);
  url.pathname = url.pathname.replace(/\/feed$/, "/feed/PriceBankFeed");

  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - PRICE_BANK_LOOKBACK_DAYS);

  url.search = new URLSearchParams({
    fromdate: fromDate.toISOString(),
    apiVersion: "2.0",
  }).toString();

  return url.toString();
}

/**
 * Normalize a feed lot into our database row format.
 */
function normalizeLot(
  lot: FeedLot,
  auctionId: number,
  houseId: string,
  existingCategories: string[] | null | undefined,
) {
  const description = stripHtml(lot.description);
  const incomingCategories = normalizeLotCategories({
    rawCategories: lot.category,
    title: lot.title,
    description,
  });

  return {
    id: lot.id,
    auction_id: auctionId,
    house_id: houseId,
    serial_number: lot.serialNumber,
    title: lot.title,
    description,
    url: lot.url,
    categories: resolveCanonicalCategoriesForIngest({
      existingCategories,
      incomingCategories,
      incomingRawCategories: lot.category,
    }),
    artists: lot.artist ?? [],
    images: lot.image ?? [],
    thumbnail_url: lot.image?.[0] ?? null,
    currency: lot.price.currency ?? "SEK",
    estimate: lot.price.estimate,
    current_bid: lot.price.bid,
    min_bid: lot.price.minBid,
    sold_price: lot.price.amount,
    start_time: lot.start,
    end_time: lot.end,
    local_end_time: lot.localEnd,
    city: lot.location.city,
    country: lot.location.country ?? "SE",
    state: lot.location.state,
    availability: lot.availability,
    raw_data: lot,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Track bid price changes for price history.
 */
async function trackPriceChange(lotId: number, currentBid: number) {
  // Only insert if the price has actually changed
  const { data: lastEntry } = await supabase
    .from("auc_price_history")
    .select("bid_amount")
    .eq("lot_id", lotId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();

  if (!lastEntry || lastEntry.bid_amount !== currentBid) {
    await supabase.from("auc_price_history").insert({
      lot_id: lotId,
      bid_amount: currentBid,
    });
  }
}

/** Strip HTML tags from description */
function stripHtml(html: string): string {
  return html?.replace(/<[^>]*>/g, "").trim() ?? "";
}

/** Split array into chunks */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// CLI entry point: `npm run ingest`
if (require.main === module) {
  ingestAllFeeds()
    .then((results) => {
      console.log("[ingest] Done:", JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[ingest] Fatal error:", err);
      process.exit(1);
    });
}
