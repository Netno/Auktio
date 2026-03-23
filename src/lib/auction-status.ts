import { createServerClient } from "./supabase";
import { normalizeAuctionTitle, stripHtml } from "./utils";
import type {
  AuctionHouseAvailability,
  AuctionStatus,
  AuctionStatusSource,
  AuctionSummary,
} from "./types";

const MS_PER_DAY = 86_400_000;
const SITE_VERIFY_TTL_MS = 10 * 60 * 1000;
const SITE_VERIFY_WINDOW_MS = 36 * 60 * 60 * 1000;
const LOT_STATS_BATCH_SIZE = 50;
const LOT_STATS_PAGE_SIZE = 1000;

type ListAuctionSummariesOptions = {
  daysBack?: number;
  daysForward?: number;
  status?: AuctionStatus | "all";
  houseId?: string;
  verifySites?: boolean;
};

type AuctionsSummaryResponse = {
  auctions: AuctionSummary[];
  availableHouses: AuctionHouseAvailability[];
  stats: Record<AuctionStatus, number>;
  daysBack: number;
  daysForward: number;
};

type AuctionRow = {
  id: number;
  house_id: string;
  title: string;
  description: string | null;
  url: string | null;
  is_live: boolean | null;
  start_time: string | null;
  end_time: string | null;
  image_url: string | null;
  auc_auction_houses?: {
    name?: string | null;
    logo_url?: string | null;
  } | null;
};

type LotRow = {
  auction_id: number;
  house_id: string;
  start_time: string | null;
  end_time: string | null;
  local_end_time: string | null;
  availability: string | null;
};

type AuctionLotStats = {
  lotCount: number;
  activeLotCount: number;
  endedLotCount: number;
  minLotStartTime: string | null;
  minLotEndTime: string | null;
  maxLotEndTime: string | null;
};

const siteStatusCache = new Map<
  string,
  { expiresAt: number; status: AuctionStatus | null }
>();
const auctionSummaryCache = new Map<
  string,
  { expiresAt: number; value: AuctionsSummaryResponse }
>();
const AUCTION_SUMMARY_CACHE_TTL_MS = 90_000;

function getAuctionSummaryCacheKey(
  options: Required<ListAuctionSummariesOptions>,
) {
  return JSON.stringify(options);
}

function minIsoDate(...values: Array<string | null | undefined>) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null
  );
}

function maxIsoDate(...values: Array<string | null | undefined>) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
  );
}

function getLotDisplayEndTime(
  lot: Pick<LotRow, "local_end_time" | "end_time">,
) {
  return lot.local_end_time ?? lot.end_time;
}

function getAuctionKey(houseId: string, auctionId: number) {
  return `${houseId}:${auctionId}`;
}

function shouldTreatLotAsActive(lot: LotRow, nowMs: number) {
  if (lot.availability != null) {
    return false;
  }

  const displayEndTime = getLotDisplayEndTime(lot);

  if (!displayEndTime) {
    return true;
  }

  return new Date(displayEndTime).getTime() > nowMs;
}

function shouldAcceptSiteVerifiedStatus(
  derivedStatus: AuctionStatus,
  siteStatus: AuctionStatus,
  lotStats: AuctionLotStats,
) {
  const isConfidentlyEnded =
    derivedStatus === "ended" &&
    lotStats.activeLotCount === 0 &&
    lotStats.endedLotCount > 0;

  if (isConfidentlyEnded && siteStatus !== "ended") {
    return false;
  }

  return true;
}

function initializeStats(): AuctionLotStats {
  return {
    lotCount: 0,
    activeLotCount: 0,
    endedLotCount: 0,
    minLotStartTime: null,
    minLotEndTime: null,
    maxLotEndTime: null,
  };
}

function parseAuctionStatusFromSiteText(text: string): AuctionStatus | null {
  const normalized = text.toUpperCase();

  if (
    normalized.includes("PÅGÅENDE") ||
    normalized.includes("LOGGA IN FÖR ATT BJUDA") ||
    normalized.includes("AKTUELLT BUD") ||
    normalized.includes("LEDANDE BUD")
  ) {
    return "ongoing";
  }

  if (
    normalized.includes("STARTAR") ||
    normalized.includes("KOMMANDE") ||
    normalized.includes("ÖPPNAR")
  ) {
    return "upcoming";
  }

  if (
    normalized.includes("AVSLUTAD") ||
    normalized.includes("KLUBBAD") ||
    normalized.includes("SÅLD")
  ) {
    return "ended";
  }

  return null;
}

async function verifyAuctionStatusFromSite(url: string) {
  const cached = siteStatusCache.get(url);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.status;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Auktio status verifier",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (!response.ok) {
      siteStatusCache.set(url, {
        expiresAt: now + SITE_VERIFY_TTL_MS,
        status: null,
      });
      return null;
    }

    const html = await response.text();
    const status = parseAuctionStatusFromSiteText(html);

    siteStatusCache.set(url, {
      expiresAt: now + SITE_VERIFY_TTL_MS,
      status,
    });

    return status;
  } catch {
    siteStatusCache.set(url, {
      expiresAt: now + SITE_VERIFY_TTL_MS,
      status: null,
    });
    return null;
  }
}

function deriveAuctionStatus(
  auction: AuctionRow,
  lotStats: AuctionLotStats,
  nowMs: number,
) {
  const effectiveStartTime = minIsoDate(
    auction.start_time,
    lotStats.minLotStartTime,
  );
  const closingStartTime = lotStats.minLotEndTime ?? auction.end_time;
  const effectiveEndTime = maxIsoDate(auction.end_time, lotStats.maxLotEndTime);

  let status: AuctionStatus = "uncertain";
  let statusSource: AuctionStatusSource = "uncertain";

  const hasStarted =
    effectiveStartTime != null &&
    new Date(effectiveStartTime).getTime() <= nowMs;
  const hasEndedLotsOnly =
    lotStats.endedLotCount > 0 && lotStats.activeLotCount === 0;

  if (lotStats.activeLotCount > 0) {
    status = "ongoing";
    statusSource = "derived-from-lots";
  } else if (hasStarted && hasEndedLotsOnly) {
    // Feed-level auction times can lag behind lot reality. If the auction has
    // already started, has ended lots, and no active lots remain, treat it as
    // ended rather than upcoming/uncertain.
    status = "ended";
    statusSource = "derived-from-lots";
  } else if (
    effectiveStartTime &&
    new Date(effectiveStartTime).getTime() > nowMs
  ) {
    status = "upcoming";
    statusSource = "database";
  } else if (
    effectiveEndTime &&
    new Date(effectiveEndTime).getTime() <= nowMs
  ) {
    status = "ended";
    statusSource = lotStats.lotCount > 0 ? "derived-from-lots" : "database";
  }

  return {
    status,
    statusSource,
    closingStartTime,
    effectiveStartTime,
    effectiveEndTime,
  };
}

function shouldVerifyAgainstSite(
  auction: AuctionRow,
  derivedStatus: AuctionStatus,
  lotStats: AuctionLotStats,
  nowMs: number,
) {
  if (!auction.url) {
    return false;
  }

  if (derivedStatus === "uncertain") {
    return true;
  }

  if (lotStats.lotCount === 0 && auction.end_time) {
    return (
      Math.abs(new Date(auction.end_time).getTime() - nowMs) <=
      SITE_VERIFY_WINDOW_MS
    );
  }

  if (derivedStatus === "ended" && auction.end_time) {
    return (
      Math.abs(new Date(auction.end_time).getTime() - nowMs) <=
      SITE_VERIFY_WINDOW_MS
    );
  }

  return false;
}

async function getLotStatsByAuctions(auctions: AuctionRow[]) {
  const supabase = createServerClient();
  const lotStats = new Map<string, AuctionLotStats>();
  const nowMs = Date.now();
  const auctionIds = Array.from(new Set(auctions.map((auction) => auction.id)));
  const houseIds = Array.from(
    new Set(auctions.map((auction) => auction.house_id).filter(Boolean)),
  );

  for (
    let index = 0;
    index < auctionIds.length;
    index += LOT_STATS_BATCH_SIZE
  ) {
    const chunk = auctionIds.slice(index, index + LOT_STATS_BATCH_SIZE);

    for (let page = 0; ; page += 1) {
      let query = supabase
        .from("auc_lots")
        .select(
          "auction_id, house_id, start_time, end_time, local_end_time, availability",
        )
        .in("auction_id", chunk)
        .range(
          page * LOT_STATS_PAGE_SIZE,
          page * LOT_STATS_PAGE_SIZE + LOT_STATS_PAGE_SIZE - 1,
        );

      if (houseIds.length > 0) {
        query = query.in("house_id", houseIds);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const lots = (data ?? []) as LotRow[];

      for (const lot of lots) {
        const statsKey = getAuctionKey(lot.house_id, lot.auction_id);
        const stats = lotStats.get(statsKey) ?? initializeStats();
        stats.lotCount += 1;
        if (shouldTreatLotAsActive(lot, nowMs)) {
          stats.activeLotCount += 1;
        } else {
          stats.endedLotCount += 1;
        }

        stats.minLotStartTime = minIsoDate(
          stats.minLotStartTime,
          lot.start_time,
        );
        const displayEndTime = getLotDisplayEndTime(lot);
        stats.minLotEndTime = minIsoDate(stats.minLotEndTime, displayEndTime);
        stats.maxLotEndTime = maxIsoDate(stats.maxLotEndTime, displayEndTime);

        lotStats.set(statsKey, stats);
      }

      if (lots.length < LOT_STATS_PAGE_SIZE) {
        break;
      }
    }
  }

  return lotStats;
}

function buildStatsRecord(auctions: AuctionSummary[]) {
  return auctions.reduce<Record<AuctionStatus, number>>(
    (accumulator, auction) => {
      accumulator[auction.status] += 1;
      return accumulator;
    },
    {
      upcoming: 0,
      ongoing: 0,
      ended: 0,
      uncertain: 0,
    },
  );
}

function buildAvailableHouses(auctions: AuctionSummary[]) {
  const counts = new Map<
    string,
    { value: string; label: string; count: number }
  >();

  for (const auction of auctions) {
    if (auction.lotCount <= 0) {
      continue;
    }

    const current = counts.get(auction.houseId);
    if (current) {
      current.count += 1;
      continue;
    }

    counts.set(auction.houseId, {
      value: auction.houseId,
      label: auction.houseName,
      count: 1,
    });
  }

  return Array.from(counts.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "sv-SE"),
  );
}

export async function listAuctionSummaries(
  options: ListAuctionSummariesOptions = {},
) {
  const {
    daysBack = 14,
    daysForward = 14,
    status = "all",
    houseId,
    verifySites = false,
  } = options;
  const cacheOptions: Required<ListAuctionSummariesOptions> = {
    daysBack,
    daysForward,
    status,
    houseId: houseId ?? "",
    verifySites,
  };
  const cacheKey = getAuctionSummaryCacheKey(cacheOptions);
  const cached = auctionSummaryCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const supabase = createServerClient();
  const nowDate = new Date(now);
  const nowMs = nowDate.getTime();
  const windowStart = new Date(nowMs - daysBack * MS_PER_DAY).toISOString();
  const windowEnd = new Date(nowMs + daysForward * MS_PER_DAY).toISOString();

  let query = supabase
    .from("auc_auctions")
    .select(
      `
        id,
        house_id,
        title,
        description,
        url,
        is_live,
        start_time,
        end_time,
        image_url,
        auc_auction_houses(name, logo_url)
      `,
    )
    .gte("end_time", windowStart)
    .lte("start_time", windowEnd)
    .order("start_time", { ascending: true })
    .limit(200);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const auctionRows = (data ?? []) as AuctionRow[];
  const lotStatsByAuctionId = await getLotStatsByAuctions(auctionRows);

  const auctions: AuctionSummary[] = [];

  for (const auction of auctionRows) {
    const lotStats =
      lotStatsByAuctionId.get(getAuctionKey(auction.house_id, auction.id)) ??
      initializeStats();
    const derived = deriveAuctionStatus(auction, lotStats, nowMs);

    let resolvedStatus: AuctionStatus = derived.status;
    let resolvedStatusSource: AuctionStatusSource = derived.statusSource;
    const verificationPending = shouldVerifyAgainstSite(
      auction,
      derived.status,
      lotStats,
      nowMs,
    );

    if (verifySites && verificationPending) {
      const siteStatus = auction.url
        ? await verifyAuctionStatusFromSite(auction.url)
        : null;

      if (siteStatus) {
        resolvedStatus = siteStatus;
        resolvedStatusSource = "site-verified";
      }
    }

    auctions.push({
      id: auction.id,
      houseId: auction.house_id,
      houseName: auction.auc_auction_houses?.name ?? auction.house_id,
      houseLogoUrl: auction.auc_auction_houses?.logo_url ?? undefined,
      title: normalizeAuctionTitle(auction.title),
      description: stripHtml(auction.description) || undefined,
      url: auction.url ?? "#",
      imageUrl: auction.image_url ?? undefined,
      isLive: Boolean(auction.is_live),
      startTime: auction.start_time ?? undefined,
      endTime: auction.end_time ?? undefined,
      closingStartTime: derived.closingStartTime ?? undefined,
      effectiveStartTime: derived.effectiveStartTime ?? undefined,
      effectiveEndTime: derived.effectiveEndTime ?? undefined,
      lotCount: lotStats.lotCount,
      activeLotCount: lotStats.activeLotCount,
      endedLotCount: lotStats.endedLotCount,
      lotDataIncomplete: lotStats.lotCount === 0,
      status: resolvedStatus,
      statusSource: resolvedStatusSource,
      verificationPending,
    });
  }

  const statusFilteredAuctions =
    status === "all"
      ? auctions
      : auctions.filter((auction) => auction.status === status);

  const availableHouses = buildAvailableHouses(statusFilteredAuctions);

  const filteredAuctions = houseId
    ? statusFilteredAuctions.filter((auction) => auction.houseId === houseId)
    : statusFilteredAuctions;

  filteredAuctions.sort((left, right) => {
    if (left.status !== right.status) {
      const rank: Record<AuctionStatus, number> = {
        ongoing: 0,
        upcoming: 1,
        uncertain: 2,
        ended: 3,
      };
      return rank[left.status] - rank[right.status];
    }

    if (left.status === "ended") {
      return (
        new Date(right.effectiveEndTime ?? right.endTime ?? 0).getTime() -
        new Date(left.effectiveEndTime ?? left.endTime ?? 0).getTime()
      );
    }

    return (
      new Date(
        left.closingStartTime ?? left.effectiveEndTime ?? left.startTime ?? 0,
      ).getTime() -
      new Date(
        right.closingStartTime ??
          right.effectiveEndTime ??
          right.startTime ??
          0,
      ).getTime()
    );
  });

  const result: AuctionsSummaryResponse = {
    auctions: filteredAuctions,
    availableHouses,
    stats: buildStatsRecord(filteredAuctions),
    daysBack,
    daysForward,
  };

  auctionSummaryCache.set(cacheKey, {
    expiresAt: now + AUCTION_SUMMARY_CACHE_TTL_MS,
    value: result,
  });

  return result;
}

export async function verifyAuctionStatuses(auctionIds: number[]) {
  const ids = Array.from(new Set(auctionIds)).filter((id) =>
    Number.isFinite(id),
  );
  if (ids.length === 0) {
    return [] as Array<{
      id: number;
      status: AuctionStatus;
      statusSource: AuctionStatusSource;
      verificationPending: false;
    }>;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_auctions")
    .select("id, house_id, start_time, end_time, url")
    .in("id", ids);

  if (error) {
    throw error;
  }

  const auctionRows = (data ?? []) as Array<
    Pick<AuctionRow, "id" | "house_id" | "start_time" | "end_time" | "url">
  >;
  const lotStatsByAuctionId = await getLotStatsByAuctions(
    auctionRows.map((row) => ({
      id: row.id,
      house_id: row.house_id,
      title: "",
      description: null,
      url: row.url,
      is_live: null,
      start_time: row.start_time,
      end_time: row.end_time,
      image_url: null,
      auc_auction_houses: null,
    })),
  );
  const nowMs = Date.now();

  const results: Array<{
    id: number;
    status: AuctionStatus;
    statusSource: AuctionStatusSource;
    verificationPending: false;
  }> = [];

  for (const row of auctionRows) {
    if (!row.url) {
      continue;
    }

    const lotStats =
      lotStatsByAuctionId.get(getAuctionKey(row.house_id, row.id)) ??
      initializeStats();
    const derived = deriveAuctionStatus(
      {
        id: row.id,
        house_id: row.house_id,
        title: "",
        description: null,
        url: row.url,
        is_live: null,
        start_time: row.start_time,
        end_time: row.end_time,
        image_url: null,
        auc_auction_houses: null,
      },
      lotStats,
      nowMs,
    );

    const siteStatus = await verifyAuctionStatusFromSite(row.url);
    if (!siteStatus) {
      continue;
    }

    if (!shouldAcceptSiteVerifiedStatus(derived.status, siteStatus, lotStats)) {
      continue;
    }

    results.push({
      id: row.id,
      status: siteStatus,
      statusSource: "site-verified",
      verificationPending: false,
    });
  }

  return results;
}
