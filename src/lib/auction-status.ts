import { createServerClient } from "./supabase";
import type {
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

function getLotDisplayEndTime(lot: Pick<LotRow, "local_end_time" | "end_time">) {
  return lot.local_end_time ?? lot.end_time;
}

function getAuctionKey(houseId: string, auctionId: number) {
  return `${houseId}:${auctionId}`;
}

function shouldTreatLotAsActive(lot: LotRow, nowMs: number) {
  if (lot.availability != null) {
    return false;
  }

  if (!lot.end_time) {
    return true;
  }

  return new Date(lot.end_time).getTime() > nowMs;
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
  const closingStartTime = minIsoDate(lotStats.minLotEndTime, auction.end_time);
  const effectiveEndTime = maxIsoDate(auction.end_time, lotStats.maxLotEndTime);

  let status: AuctionStatus = "uncertain";
  let statusSource: AuctionStatusSource = "uncertain";

  if (lotStats.activeLotCount > 0) {
    status = "ongoing";
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

  for (let index = 0; index < auctionIds.length; index += LOT_STATS_BATCH_SIZE) {
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
  const supabase = createServerClient();
  const now = new Date();
  const nowMs = now.getTime();
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

  if (houseId) {
    query = query.eq("house_id", houseId);
  }

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
      title: auction.title,
      description: auction.description ?? undefined,
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

  const filteredAuctions =
    status === "all"
      ? auctions
      : auctions.filter((auction) => auction.status === status);

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
        right.closingStartTime ?? right.effectiveEndTime ?? right.startTime ?? 0,
      ).getTime()
    );
  });

  return {
    auctions: filteredAuctions,
    stats: buildStatsRecord(filteredAuctions),
    daysBack,
    daysForward,
  };
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
    .select("id, url")
    .in("id", ids);

  if (error) {
    throw error;
  }

  const results: Array<{
    id: number;
    status: AuctionStatus;
    statusSource: AuctionStatusSource;
    verificationPending: false;
  }> = [];

  for (const row of data ?? []) {
    if (!row.url) {
      continue;
    }

    const siteStatus = await verifyAuctionStatusFromSite(row.url);
    if (!siteStatus) {
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
