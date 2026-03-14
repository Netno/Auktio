import Link from "next/link";
import { ArrowUpRight, Check, Clock3, Layers3 } from "lucide-react";
import { AuctionStatusBadge } from "./AuctionStatusBadge";
import { formatDate } from "@/lib/utils";
import type { AuctionSummary } from "@/lib/types";

interface AuctionListRowProps {
  auction: AuctionSummary;
  isSelected?: boolean;
  onToggleSelect?: (auction: AuctionSummary) => void;
  showStartTime?: boolean;
}

const AUCTION_DESKTOP_GRID_CLASS = {
  default: "xl:grid-cols-[190px_minmax(0,2.7fr)_88px_88px_100px_232px]",
  upcoming: "xl:grid-cols-[190px_minmax(0,2.7fr)_150px_88px_88px_100px_232px]",
} as const;

export function getAuctionDesktopGridClass(showStartTime: boolean) {
  return showStartTime
    ? AUCTION_DESKTOP_GRID_CLASS.upcoming
    : AUCTION_DESKTOP_GRID_CLASS.default;
}

function formatAuctionDate(value?: string) {
  return value ? formatDate(value) : "–";
}

function formatAuctionEndDate(value?: string) {
  if (!value) {
    return "–";
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);

  if (!match) {
    return "–";
  }

  const [, year, month, day, hour, minute] = match;
  const weekday = new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    timeZone: "UTC",
  }).format(
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0)),
  );

  const monthLabel = new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    timeZone: "UTC",
  }).format(
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0)),
  );

  return `${weekday} ${Number(day)} ${monthLabel} ${hour}:${minute}`;
}

export function AuctionListRow({
  auction,
  isSelected = false,
  onToggleSelect,
  showStartTime = false,
}: AuctionListRowProps) {
  const lotsLink = `/?auctionId=${auction.id}&houseId=${encodeURIComponent(auction.houseId)}&auctionTitle=${encodeURIComponent(auction.title)}`;
  const desktopGridClass = getAuctionDesktopGridClass(showStartTime);
  const actionButtonClass = `inline-flex min-h-10 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${
    isSelected
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-brand-200 text-brand-700 hover:bg-brand-50"
  }`;
  const mobileActionsGridClass = onToggleSelect
    ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
    : "grid-cols-[minmax(0,1fr)_auto]";
  const endLabel = formatAuctionEndDate(
    auction.closingStartTime ?? auction.effectiveEndTime ?? auction.endTime,
  );
  const startLabel = formatAuctionDate(
    auction.effectiveStartTime ?? auction.startTime,
  );

  return (
    <article className="rounded-lg border border-brand-200/80 bg-white px-3 py-2.5 shadow-card transition-colors hover:border-brand-300 sm:px-3.5 xl:px-3">
      <div className="space-y-3 xl:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-950">
              <Clock3 size={13} className="text-accent-500" />
              {endLabel}
            </p>
            {showStartTime && (
              <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-brand-500">
                <Clock3 size={12} className="text-brand-400" />
                Start {startLabel}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <AuctionStatusBadge status={auction.status} />
            {auction.isLive && (
              <span className="whitespace-nowrap rounded-full bg-brand-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                Live
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="line-clamp-2 font-serif text-[18px] leading-tight text-brand-900">
            {auction.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-brand-600">
              {auction.houseName}
            </span>
            {auction.statusSource === "site-verified" && (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                Sajtkollad
              </span>
            )}
          </div>

          {auction.description && (
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-brand-500">
              {auction.description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-brand-50 p-2.5">
          <div className="rounded-lg bg-white px-2.5 py-2 text-center shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
              Föremål
            </div>
            <div className="mt-1 text-[15px] font-semibold text-brand-950">
              {auction.lotDataIncomplete ? "-" : auction.lotCount}
            </div>
          </div>
          <div className="rounded-lg bg-white px-2.5 py-2 text-center shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
              Öppna
            </div>
            <div className="mt-1 text-[15px] font-semibold text-brand-950">
              {auction.activeLotCount}
            </div>
          </div>
          <div className="rounded-lg bg-white px-2.5 py-2 text-center shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
              Avslutade
            </div>
            <div className="mt-1 text-[15px] font-semibold text-brand-950">
              {auction.lotDataIncomplete ? "-" : auction.endedLotCount}
            </div>
          </div>
        </div>

        {auction.lotDataIncomplete && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700">
            Antal föremål är inte helt synkat ännu.
          </p>
        )}

        <div className={`grid ${mobileActionsGridClass} gap-2`}>
          <Link
            href={lotsLink}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-brand-950"
          >
            <Layers3 size={16} />
            Visa föremål
          </Link>

          {onToggleSelect && (
            <button
              type="button"
              onClick={() => onToggleSelect(auction)}
              className={`${actionButtonClass} min-h-11 rounded-xl px-3 py-3`}
            >
              {isSelected && <Check size={14} />}
              {isSelected ? "Vald i urval" : "Lägg till i urval"}
            </button>
          )}

          <a
            href={auction.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-200 px-3 py-3 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            aria-label={`Öppna ${auction.title} externt`}
          >
            <ArrowUpRight size={16} />
          </a>
        </div>
      </div>

      <div
        className={`hidden xl:grid ${desktopGridClass} xl:items-start xl:gap-2.5`}
      >
        <div className="min-w-0 xl:block xl:self-start">
          <p className="mt-0.5 inline-flex max-w-full items-center gap-1 whitespace-nowrap text-[14px] font-semibold text-brand-950 xl:text-[15px]">
            <Clock3 size={13} className="text-accent-500" />
            {endLabel}
          </p>
        </div>

        <div className="min-w-0 self-start">
          <div className="mb-1 flex items-start gap-1.5 min-w-0">
            {auction.isLive && (
              <span className="whitespace-nowrap rounded-full bg-brand-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Live
              </span>
            )}
          </div>

          <h3 className="truncate font-serif text-[16px] leading-tight text-brand-900 xl:mt-0.5 xl:text-[17px]">
            {auction.title}
          </h3>

          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-brand-500">
              {auction.houseName}
            </p>
            {auction.statusSource === "site-verified" && (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                Sajtkollad
              </span>
            )}
          </div>

          {auction.description && (
            <p className="mt-0.5 truncate text-[12px] text-brand-500">
              {auction.description}
            </p>
          )}
        </div>

        {showStartTime && (
          <div className="min-w-0 xl:block xl:self-start">
            <p className="mt-0.5 inline-flex max-w-full items-center gap-1 whitespace-nowrap text-[12px] text-brand-600 xl:text-[13px]">
              <Clock3 size={13} className="text-brand-400" />
              {startLabel}
            </p>
          </div>
        )}

        <div className="min-w-0 xl:flex xl:justify-center xl:self-start xl:text-center">
          <p className="mt-0.5 whitespace-nowrap text-[13px] font-semibold text-brand-900 sm:text-[14px] xl:text-center">
            {auction.lotDataIncomplete ? "-" : auction.lotCount}
          </p>
        </div>

        <div className="min-w-0 xl:flex xl:justify-center xl:self-start xl:text-center">
          <p className="mt-0.5 whitespace-nowrap text-[13px] font-semibold text-brand-900 sm:text-[14px] xl:text-center">
            {auction.activeLotCount}
          </p>
        </div>

        <div className="min-w-0 xl:block xl:self-start">
          <div className="mt-0.5 flex flex-col items-start gap-1">
            <AuctionStatusBadge status={auction.status} />
            {auction.lotDataIncomplete ? (
              <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                Antal ej synkat
              </span>
            ) : (
              <span className="inline-flex whitespace-nowrap rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">
                {auction.endedLotCount} avsl.
              </span>
            )}
          </div>
        </div>

        <div className="xl:flex xl:self-start xl:justify-self-start xl:justify-start xl:gap-1.5">
          {onToggleSelect && (
            <button
              type="button"
              onClick={() => onToggleSelect(auction)}
              className={`${actionButtonClass} min-h-8 px-1.5 py-1.5 xl:w-[calc(4.7rem-1px)] xl:shrink-0`}
            >
              <span className="grid w-full grid-cols-[14px_1fr_14px] items-center gap-0.5">
                <Check
                  size={14}
                  aria-hidden="true"
                  className={isSelected ? "opacity-100" : "opacity-0"}
                />
                <span className="text-center">
                  {isSelected ? "Vald" : "Välj"}
                </span>
                <span aria-hidden="true" />
              </span>
            </button>
          )}

          <div className="flex gap-2 xl:flex-none">
            <Link
              href={lotsLink}
              className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-brand-900 px-2.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-950 xl:shrink-0"
            >
              <Layers3 size={14} />
              Visa föremål
            </Link>
            <a
              href={auction.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-brand-200 px-2.5 py-1.5 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
