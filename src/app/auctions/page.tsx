"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Layers3, SlidersHorizontal } from "lucide-react";
import { Header } from "@/components/Header";
import {
  AuctionListRow,
  getAuctionDesktopGridClass,
} from "@/components/AuctionListRow";
import { FEED_SOURCES } from "@/config/sources";
import type {
  AuctionsResponse,
  AuctionStatus,
  AuctionSummary,
} from "@/lib/types";

const DEFAULT_DAYS = 14;
const PAGE_DATA_REVISION = Date.now();

const STATUS_OPTIONS: Array<{ value: AuctionStatus | "all"; label: string }> = [
  { value: "all", label: "Alla" },
  { value: "ongoing", label: "Pågår nu" },
  { value: "upcoming", label: "Kommande" },
  { value: "ended", label: "Avslutade" },
];

const SORTED_FEED_SOURCES = [...FEED_SOURCES].sort((left, right) =>
  left.name.localeCompare(right.name, "sv-SE"),
);

function getAuctionKey(auction: Pick<AuctionSummary, "id" | "houseId">) {
  return `${auction.houseId}:${auction.id}`;
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="rounded-lg border border-brand-200 bg-white px-3 py-2.5 shadow-card animate-pulse sm:px-3.5"
        >
          <div className="flex flex-col gap-2.5 xl:grid xl:grid-cols-[190px_minmax(0,2.7fr)_150px_64px_72px_100px_232px] xl:items-start xl:gap-2.5">
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded-full bg-brand-100" />
                <div className="h-4 w-28 rounded bg-brand-100" />
              </div>
              <div className="h-4 w-3/4 rounded bg-brand-100" />
              <div className="h-3 w-1/2 rounded bg-brand-100" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-1">
                <div className="h-3 w-12 rounded bg-brand-100" />
                <div className="h-3.5 w-20 rounded bg-brand-100" />
              </div>
              <div className="space-y-1">
                <div className="h-3 w-12 rounded bg-brand-100" />
                <div className="h-3.5 w-20 rounded bg-brand-100" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="h-6 rounded bg-brand-100" />
              <div className="h-6 rounded bg-brand-100" />
              <div className="h-6 rounded bg-brand-100" />
            </div>
            <div className="flex gap-1.5">
              <div className="h-8 w-20 rounded-lg bg-brand-100" />
              <div className="h-8 w-28 rounded-lg bg-brand-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getRelativeDayDifference(value?: string) {
  if (!value) return null;
  const now = new Date();
  const date = new Date(value);
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const compare = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  return Math.round((compare - today) / 86_400_000);
}

function getRemainingDaysInCurrentWeek() {
  const today = new Date().getDay();
  return (7 - today) % 7;
}

function groupAuctionsForDisplay(
  auctions: AuctionSummary[],
  status: AuctionStatus,
) {
  const groups = new Map<string, AuctionSummary[]>();
  const remainingDaysInCurrentWeek = getRemainingDaysInCurrentWeek();

  for (const auction of auctions) {
    const anchor =
      status === "ended"
        ? (auction.effectiveEndTime ?? auction.endTime)
        : status === "upcoming"
          ? (auction.closingStartTime ??
            auction.effectiveStartTime ??
            auction.startTime)
          : (auction.closingStartTime ??
            auction.effectiveEndTime ??
            auction.endTime ??
            auction.startTime);
    const relativeDay = getRelativeDayDifference(anchor);

    let label = "Övrigt";
    if (status === "ongoing") {
      if (relativeDay != null && relativeDay < 0) label = "Har börjat avslutas";
      else if (relativeDay === 0) label = "Slutar idag";
      else if (
        relativeDay != null &&
        relativeDay > 0 &&
        relativeDay <= remainingDaysInCurrentWeek
      )
        label = "Avslutas denna veckan";
      else label = "Nästa vecka och framåt";
    } else if (status === "upcoming") {
      if (relativeDay === 0) label = "Startar idag";
      else if (relativeDay != null && relativeDay > 0 && relativeDay <= 7)
        label = "Startar den här veckan";
      else label = "Startar senare";
    } else if (status === "ended") {
      if (relativeDay === 0) label = "Avslutades idag";
      else if (relativeDay != null && relativeDay >= -7)
        label = "Avslutades senaste veckan";
      else label = "Avslutades tidigare";
    } else if (status === "uncertain") {
      label = "Behöver verifiering";
    }

    groups.set(label, [...(groups.get(label) ?? []), auction]);
  }

  const orderedEntries = Array.from(groups.entries());

  if (status === "ongoing") {
    const rank: Record<string, number> = {
      "Har börjat avslutas": 0,
      "Slutar idag": 1,
      "Avslutas denna veckan": 2,
      "Nästa vecka och framåt": 3,
      Övrigt: 4,
    };
    orderedEntries.sort(
      ([leftLabel], [rightLabel]) =>
        (rank[leftLabel] ?? Number.MAX_SAFE_INTEGER) -
        (rank[rightLabel] ?? Number.MAX_SAFE_INTEGER),
    );
  }

  return orderedEntries.map(([label, items]) => ({
    label,
    items: [...items].sort((left, right) => {
      const leftAnchor =
        status === "ended"
          ? (left.effectiveEndTime ?? left.endTime)
          : status === "upcoming"
            ? (left.closingStartTime ??
              left.effectiveStartTime ??
              left.startTime)
            : (left.closingStartTime ??
              left.effectiveEndTime ??
              left.endTime ??
              left.startTime);
      const rightAnchor =
        status === "ended"
          ? (right.effectiveEndTime ?? right.endTime)
          : status === "upcoming"
            ? (right.closingStartTime ??
              right.effectiveStartTime ??
              right.startTime)
            : (right.closingStartTime ??
              right.effectiveEndTime ??
              right.endTime ??
              right.startTime);

      return (
        new Date(leftAnchor ?? 0).getTime() -
        new Date(rightAnchor ?? 0).getTime()
      );
    }),
  }));
}

function Section({
  title,
  auctions,
  status,
  selectedIds,
  onToggleSelect,
}: {
  title: string;
  auctions: AuctionSummary[];
  status: AuctionStatus;
  selectedIds: Set<string>;
  onToggleSelect: (auction: AuctionSummary) => void;
}) {
  if (auctions.length === 0) {
    return null;
  }

  const groupedAuctions = groupAuctionsForDisplay(auctions, status);
  const showStartTime = status === "upcoming";
  const headerGridClass = getAuctionDesktopGridClass(showStartTime);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 border-b border-brand-200 pb-2">
        <div>
          <h2 className="font-serif text-xl text-brand-900">{title}</h2>
          <p className="text-[13px] text-brand-500">
            {auctions.length} auktioner
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {groupedAuctions.map((group) => (
          <div key={group.label} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="rounded-full bg-brand-100 px-3 py-1 text-[13px] font-bold uppercase tracking-[0.14em] text-brand-700">
                {group.label}
              </h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-500 ring-1 ring-brand-200">
                {group.items.length} auktioner
              </span>
            </div>

            <div
              className={`hidden xl:grid ${headerGridClass} xl:items-start xl:gap-2.5 xl:px-3`}
            >
              <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
                Första avslut
              </span>
              <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
                Auktion
              </span>
              {showStartTime && (
                <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
                  Start
                </span>
              )}
              <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400 text-center">
                Föremål
              </span>
              <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400 text-center">
                Öppna
              </span>
              <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
                Status
              </span>
              <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
                Åtgärder
              </span>
            </div>

            <div className="space-y-2">
              {group.items.map((auction) => (
                <AuctionListRow
                  key={getAuctionKey(auction)}
                  auction={auction}
                  isSelected={selectedIds.has(getAuctionKey(auction))}
                  onToggleSelect={onToggleSelect}
                  showStartTime={showStartTime}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AuctionsPage() {
  const [status, setStatus] = useState<AuctionStatus | "all">("all");
  const [houseId, setHouseId] = useState("");
  const [daysBack, setDaysBack] = useState(DEFAULT_DAYS);
  const [daysForward, setDaysForward] = useState(DEFAULT_DAYS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedAuctions, setSelectedAuctions] = useState<AuctionSummary[]>(
    [],
  );
  const [data, setData] = useState<AuctionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAuctions() {
      setLoading(true);
      setError(null);
      setData(null);

      const params = new URLSearchParams({
        status,
        daysBack: String(daysBack),
        daysForward: String(daysForward),
      });

      if (houseId) {
        params.set("houseId", houseId);
      }

      params.set("_ts", String(Date.now()));

      try {
        const response = await fetch(`/api/auctions?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Auktionsladdning misslyckades: ${response.status}`);
        }

        const result = (await response.json()) as AuctionsResponse;
        setData(result);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }

        setError(
          err instanceof Error ? err.message : "Kunde inte ladda auktioner",
        );
      } finally {
        setLoading(false);
      }
    }

    loadAuctions();

    return () => controller.abort();
  }, [daysBack, daysForward, houseId, status, PAGE_DATA_REVISION]);

  useEffect(() => {
    if (!data || loading) {
      return;
    }

    const pendingIds = data.auctions
      .filter((auction) => auction.verificationPending)
      .map((auction) => auction.id)
      .slice(0, 25);

    if (pendingIds.length === 0) {
      return;
    }

    const controller = new AbortController();

    async function verifyPendingAuctions() {
      try {
        const response = await fetch(
          `/api/auctions/verify?ids=${pendingIds.join(",")}&_ts=${Date.now()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as {
          updates: Array<
            Pick<
              AuctionSummary,
              "id" | "status" | "statusSource" | "verificationPending"
            >
          >;
        };

        if (!result.updates.length) {
          return;
        }

        setData((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            auctions: current.auctions.map((auction) => {
              const update = result.updates.find(
                (item) => item.id === auction.id,
              );
              return update ? { ...auction, ...update } : auction;
            }),
          };
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error(
            "[auctions-page] Background verification failed:",
            error,
          );
        }
      }
    }

    verifyPendingAuctions();

    return () => controller.abort();
  }, [data, loading]);

  const grouped = useMemo(() => {
    const auctions = data?.auctions ?? [];
    return {
      ongoing: auctions.filter((auction) => auction.status === "ongoing"),
      upcoming: auctions.filter((auction) => auction.status === "upcoming"),
      ended: auctions.filter((auction) => auction.status === "ended"),
      uncertain: auctions.filter((auction) => auction.status === "uncertain"),
    };
  }, [data]);

  const selectedIds = useMemo(
    () => new Set(selectedAuctions.map((auction) => getAuctionKey(auction))),
    [selectedAuctions],
  );

  const selectedLotsHref = useMemo(() => {
    if (selectedAuctions.length === 0) {
      return "/";
    }

    const params = new URLSearchParams();
    params.set(
      "auctionId",
      selectedAuctions.map((auction) => auction.id).join(","),
    );

    const uniqueHouseIds = Array.from(
      new Set(selectedAuctions.map((auction) => auction.houseId)),
    );
    if (uniqueHouseIds.length === 1) {
      params.set("houseId", uniqueHouseIds[0]);
    }

    for (const auction of selectedAuctions) {
      params.append("auctionTitle", auction.title);
    }

    return `/?${params.toString()}`;
  }, [selectedAuctions]);

  const toggleAuctionSelection = (auction: AuctionSummary) => {
    setSelectedAuctions((current) => {
      if (
        current.some((item) => getAuctionKey(item) === getAuctionKey(auction))
      ) {
        return current.filter(
          (item) => getAuctionKey(item) !== getAuctionKey(auction),
        );
      }

      return [...current, auction];
    });
  };

  return (
    <div className="min-h-screen bg-brand-50">
      <Header activeView="auctions" />

      <section className="bg-gradient-to-b from-brand-900 via-brand-950 to-brand-50 px-4 pb-4 pt-2.5 sm:px-6 sm:pb-5">
        <div className="mx-auto max-w-[1360px]">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
            Auktionöversikt
          </p>
          <h1 className="max-w-3xl font-serif text-[24px] leading-[1.02] text-white sm:text-[30px]">
            Se vad som pågår nu, vad som kommer och vad som nyligen avslutats.
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] text-white/65 sm:text-[14px]">
            Standardvyn visar två veckor bakåt och två veckor framåt. Välj sedan
            en auktion för att se dess föremål.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-[1360px] px-4 pb-20 sm:px-6">
        {selectedAuctions.length > 0 && (
          <div className="sticky top-14 z-40 -mt-4 mb-3 rounded-xl border border-emerald-200 bg-white/95 p-3 shadow-card backdrop-blur sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Ditt urval
                </p>
                <p className="mt-1 text-[13px] text-brand-700">
                  {selectedAuctions.length} vald
                  {selectedAuctions.length === 1 ? " auktion" : "a auktioner"}.
                  Visa bara föremålen från dessa eller fortsätt välja fler.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setSelectedAuctions([])}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-brand-200 px-3 py-2 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                >
                  Rensa urval
                </button>
                <Link
                  href={selectedLotsHref}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  <Layers3 size={14} />
                  Visa valda föremål
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="-mt-1 rounded-xl border border-brand-200 bg-white p-3 shadow-card sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
                Filter och sortering
              </p>
              <p className="mt-1 text-[13px] text-brand-500">
                Status, auktionshus och tidsfönster
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((current) => !current)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2 text-[13px] font-semibold text-brand-800 transition-colors hover:bg-brand-50"
              aria-expanded={mobileFiltersOpen}
              aria-controls="mobile-auction-filters"
            >
              <SlidersHorizontal size={15} />
              {mobileFiltersOpen ? "Dolj" : "Visa"}
              <ChevronDown
                size={15}
                className={`transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div
              id="mobile-auction-filters"
              className={`${mobileFiltersOpen ? "grid" : "hidden"} flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:grid`}
            >
              <label className="grid gap-1 text-[13px] text-brand-600">
                Status
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as AuctionStatus | "all")
                  }
                  className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-[13px] text-brand-900 outline-none"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-[13px] text-brand-600">
                Auktionshus
                <select
                  value={houseId}
                  onChange={(e) => setHouseId(e.target.value)}
                  className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-[13px] text-brand-900 outline-none"
                >
                  <option value="">Alla hus</option>
                  {SORTED_FEED_SOURCES.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-[13px] text-brand-600">
                Dagar bakåt
                <select
                  value={daysBack}
                  onChange={(e) => setDaysBack(Number(e.target.value))}
                  className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-[13px] text-brand-900 outline-none"
                >
                  {[7, 14, 21].map((value) => (
                    <option key={value} value={value}>
                      {value} dagar
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-[13px] text-brand-600">
                Dagar framåt
                <select
                  value={daysForward}
                  onChange={(e) => setDaysForward(Number(e.target.value))}
                  className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-[13px] text-brand-900 outline-none"
                >
                  {[7, 14, 21].map((value) => (
                    <option key={value} value={value}>
                      {value} dagar
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:min-w-[320px] lg:gap-2">
              <div className="rounded-lg bg-brand-50 px-2.5 py-2 sm:px-3 sm:py-2.5">
                <div className="text-[9px] uppercase tracking-[0.1em] text-brand-400 sm:text-[10px] sm:tracking-[0.12em]">
                  Pågår
                </div>
                <div className="mt-0.5 text-[15px] font-semibold leading-none text-brand-900 sm:mt-1 sm:text-lg">
                  {data?.stats.ongoing ?? 0}
                </div>
              </div>
              <div className="rounded-lg bg-brand-50 px-2.5 py-2 sm:px-3 sm:py-2.5">
                <div className="text-[9px] uppercase tracking-[0.1em] text-brand-400 sm:text-[10px] sm:tracking-[0.12em]">
                  Kommande
                </div>
                <div className="mt-0.5 text-[15px] font-semibold leading-none text-brand-900 sm:mt-1 sm:text-lg">
                  {data?.stats.upcoming ?? 0}
                </div>
              </div>
              <div className="rounded-lg bg-brand-50 px-2.5 py-2 sm:px-3 sm:py-2.5">
                <div className="text-[9px] uppercase tracking-[0.1em] text-brand-400 sm:text-[10px] sm:tracking-[0.12em]">
                  Avslutade
                </div>
                <div className="mt-0.5 text-[15px] font-semibold leading-none text-brand-900 sm:mt-1 sm:text-lg">
                  {data?.stats.ended ?? 0}
                </div>
              </div>
              <div className="rounded-lg bg-brand-50 px-2.5 py-2 sm:px-3 sm:py-2.5">
                <div className="text-[9px] uppercase tracking-[0.1em] text-brand-400 sm:text-[10px] sm:tracking-[0.12em]">
                  Osäkra
                </div>
                <div className="mt-0.5 text-[15px] font-semibold leading-none text-brand-900 sm:mt-1 sm:text-lg">
                  {data?.stats.uncertain ?? 0}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-6">
          {loading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-brand-200 pb-2">
                <div>
                  <h2 className="font-serif text-xl text-brand-900">
                    Laddar auktioner
                  </h2>
                  <p className="text-[13px] text-brand-500">
                    Hämtar pågående, kommande och avslutade auktioner...
                  </p>
                </div>
              </div>
              <LoadingRows />
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && (data?.auctions.length ?? 0) === 0 && (
            <div className="rounded-xl border border-brand-200 bg-white px-5 py-10 text-center shadow-card">
              <h2 className="font-serif text-xl text-brand-900">
                Inga auktioner hittades
              </h2>
              <p className="mt-2 text-[13px] text-brand-500">
                Prova att ändra tidsfönster eller auktionshus.
              </p>
            </div>
          )}

          {!loading && !error && (
            <>
              <Section
                title="Pågår nu"
                auctions={grouped.ongoing}
                status="ongoing"
                selectedIds={selectedIds}
                onToggleSelect={toggleAuctionSelection}
              />
              <Section
                title="Kommande"
                auctions={grouped.upcoming}
                status="upcoming"
                selectedIds={selectedIds}
                onToggleSelect={toggleAuctionSelection}
              />
              <Section
                title="Avslutade"
                auctions={grouped.ended}
                status="ended"
                selectedIds={selectedIds}
                onToggleSelect={toggleAuctionSelection}
              />
              <Section
                title="Behöver kontroll"
                auctions={grouped.uncertain}
                status="uncertain"
                selectedIds={selectedIds}
                onToggleSelect={toggleAuctionSelection}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
