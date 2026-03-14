import { createServerClient } from "./supabase";
import { FEED_SOURCES } from "../config/sources";
import type { FeedResponse, FeedLot, IngestResult } from "./types";
import { normalizeAuctionTitle } from "./utils";

const supabase = createServerClient();

/** Retry config */
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000; // exponential: 2s, 4s, 8s
const PRICE_BANK_LOOKBACK_DAYS = 30;

/**
 * Ingest all configured feed sources.
 * Called by /api/ingest (Vercel Cron) or manually via `npm run ingest`.
 */
export async function ingestAllFeeds(): Promise<IngestResult[]> {
  const results: IngestResult[] = [];

  for (const source of FEED_SOURCES) {
    console.log(`[ingest] Starting: ${source.name} (${source.id})`);
    const result = await ingestFeed(source.id, source.feedUrl);
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
  const key = [
    lot.title,
    lot.price.bid ?? "",
    lot.price.amount ?? "",
    lot.price.estimate ?? "",
    lot.availability ?? "",
    lot.end,
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
): Promise<IngestResult> {
  const startTime = Date.now();

  try {
    // 1. Fetch feed (with retry)
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

    // 2. Ensure auction house exists
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

    // 3. Collect all lot IDs from this feed to check existing hashes
    const allFeedLotIds = feed.auctions.flatMap((a) => a.lots.map((l) => l.id));
    const existingHashes = await getExistingLotHashes(allFeedLotIds);

    // 4. Process each auction and its lots
    for (const auction of feed.auctions) {
      // Upsert auction
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

      // Filter out unchanged lots
      const changedLots: FeedLot[] = [];
      for (const lot of auction.lots) {
        const newHash = computeLotHash(lot);
        if (existingHashes.get(lot.id) === newHash) {
          lotsSkipped++;
        } else {
          changedLots.push(lot);
        }
      }

      if (changedLots.length === 0) continue;

      // Upsert lots in batches of 50
      const lotBatches = chunkArray(changedLots, 50);

      for (const batch of lotBatches) {
        const lotRows = batch.map((lot) => ({
          ...normalizeLot(lot, auction.id, houseId),
          content_hash: computeLotHash(lot),
        }));

        const { data, error } = await supabase
          .from("auc_lots")
          .upsert(lotRows, { onConflict: "id" })
          .select("id");

        if (error) {
          console.error(`[ingest] Batch error for ${houseId}:`, error.message);
          continue;
        }

        // Track price changes
        for (const lot of batch) {
          if (lot.price.bid != null) {
            await trackPriceChange(lot.id, lot.price.bid);
          }
        }

        // Count: if lot was in existingHashes it's an update, else it's new
        for (const lot of batch) {
          if (existingHashes.has(lot.id)) {
            lotsUpdated++;
          } else {
            lotsAdded++;
          }
        }
      }
    }

    soldPricesUpdated = await ingestPriceBankFeed(houseId, feedUrl);

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
async function getExistingLotHashes(
  lotIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (lotIds.length === 0) return map;

  // Query in chunks of 500 (Supabase URL length limit)
  const chunks = chunkArray(lotIds, 500);
  for (const chunk of chunks) {
    const { data } = await supabase
      .from("auc_lots")
      .select("id, content_hash")
      .in("id", chunk);
    for (const row of data ?? []) {
      if (row.content_hash) map.set(row.id, row.content_hash);
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
    }
  >
> {
  const map = new Map<
    number,
    {
      auction_id: number;
      content_hash: string | null;
      sold_price: number | null;
    }
  >();

  if (lotIds.length === 0) return map;

  const chunks = chunkArray(lotIds, 500);
  for (const chunk of chunks) {
    const { data } = await supabase
      .from("auc_lots")
      .select("id, auction_id, content_hash, sold_price")
      .eq("house_id", houseId)
      .in("id", chunk);

    for (const row of data ?? []) {
      map.set(row.id, {
        auction_id: row.auction_id,
        content_hash: row.content_hash,
        sold_price: row.sold_price,
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
          ...normalizeLot(lot, existing.auction_id, houseId),
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
function normalizeLot(lot: FeedLot, auctionId: number, houseId: string) {
  return {
    id: lot.id,
    auction_id: auctionId,
    house_id: houseId,
    serial_number: lot.serialNumber,
    title: lot.title,
    description: stripHtml(lot.description),
    url: lot.url,
    categories: lot.category ?? [],
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
