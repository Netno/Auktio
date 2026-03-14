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

function formatAuctionDate(value?: string) {
  return value ? formatDate(value) : "–";
}

function formatAuctionEndDate(value?: string) {
  if (!value) {
    return "–";
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/,
  );

  if (!match) {
    return "–";
  }

  const [, year, month, day, hour, minute] = match;
  const weekday = new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0)));

  const monthLabel = new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0)));

  return `${weekday} ${Number(day)} ${monthLabel} ${hour}:${minute}`;
}

export function AuctionListRow({
  auction,
  isSelected = false,
  onToggleSelect,
  showStartTime = false,
}: AuctionListRowProps) {
  const lotsLink = `/?auctionId=${auction.id}&houseId=${encodeURIComponent(auction.houseId)}&auctionTitle=${encodeURIComponent(auction.title)}`;
  const desktopGridClass = showStartTime
    ? "xl:grid-cols-[190px_minmax(0,2.7fr)_150px_88px_88px_100px_auto]"
    : "xl:grid-cols-[190px_minmax(0,2.7fr)_88px_88px_100px_auto]";

  return (
    <article className="rounded-lg border border-brand-200/80 bg-white px-3 py-2.5 shadow-card transition-colors hover:border-brand-300 sm:px-3.5">
      <div className={`flex flex-col gap-2.5 xl:grid ${desktopGridClass} xl:items-start xl:gap-2.5`}>
        <div className="min-w-0 grid grid-cols-2 gap-1.5 text-sm xl:block xl:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400 xl:hidden">
            Första avslut
          </p>
          <p className="mt-0.5 inline-flex max-w-full items-center gap-1 whitespace-nowrap text-[14px] font-semibold text-brand-950 xl:text-[15px]">
            <Clock3 size={13} className="text-accent-500" />
            {formatAuctionEndDate(
              auction.closingStartTime ??
                auction.effectiveEndTime ??
                auction.endTime,
            )}
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
          <div className="min-w-0 grid grid-cols-2 gap-1.5 text-sm xl:block xl:self-start">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400 xl:hidden">
              Start
            </p>
            <p className="mt-0.5 inline-flex max-w-full items-center gap-1 whitespace-nowrap text-[12px] text-brand-600 xl:text-[13px]">
              <Clock3 size={13} className="text-brand-400" />
              {formatAuctionDate(auction.effectiveStartTime ?? auction.startTime)}
            </p>
          </div>
        )}

        <div className="min-w-0 grid grid-cols-3 gap-1.5 xl:self-start xl:text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400 xl:hidden">
            Föremål
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[13px] font-semibold text-brand-900 sm:text-[14px] xl:text-center">
            {auction.lotDataIncomplete ? "-" : auction.lotCount}
          </p>
        </div>

        <div className="min-w-0 grid grid-cols-3 gap-1.5 xl:self-start xl:text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400 xl:hidden">
            Öppna nu
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[13px] font-semibold text-brand-900 sm:text-[14px] xl:text-center">
            {auction.activeLotCount}
          </p>
        </div>

        <div className="min-w-0 grid grid-cols-3 gap-1.5 xl:block xl:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400 xl:hidden">
            Status
          </p>
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

        <div className="flex flex-col gap-1.5 sm:flex-row xl:self-start xl:justify-self-end xl:justify-end xl:gap-1.5">
          {onToggleSelect && (
            <button
              type="button"
              onClick={() => onToggleSelect(auction)}
              className={`inline-flex min-h-8 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                isSelected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-brand-200 text-brand-700 hover:bg-brand-50"
              }`}
            >
              {isSelected && <Check size={14} />}
              {isSelected ? "Vald" : "Välj"}
            </button>
          )}

          <div className="flex gap-2 sm:flex-1 xl:flex-none">
            <Link
              href={lotsLink}
              className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-brand-900 px-2.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-950"
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
