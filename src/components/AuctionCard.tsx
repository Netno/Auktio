import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Clock3, Gavel, LayoutList } from "lucide-react";
import { AuctionStatusBadge } from "./AuctionStatusBadge";
import { formatDate } from "@/lib/utils";
import type { AuctionSummary } from "@/lib/types";

interface AuctionCardProps {
  auction: AuctionSummary;
  isSelected?: boolean;
  onToggleSelect?: (auction: AuctionSummary) => void;
}

function formatAuctionDate(value?: string) {
  if (!value) {
    return "–";
  }

  return formatDate(value);
}

export function AuctionCard({
  auction,
  isSelected = false,
  onToggleSelect,
}: AuctionCardProps) {
  const lotsLink = `/?auctionId=${auction.id}&houseId=${encodeURIComponent(auction.houseId)}&auctionTitle=${encodeURIComponent(auction.title)}`;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-200/70 bg-white shadow-card">
      <div className="relative aspect-[16/8] overflow-hidden bg-brand-100">
        {auction.imageUrl ? (
          <Image
            src={auction.imageUrl}
            alt={auction.title}
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-brand-300">
            <Gavel size={28} />
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <AuctionStatusBadge status={auction.status} />
          {auction.isLive && (
            <span className="inline-flex items-center rounded-full bg-brand-900/85 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              Live
            </span>
          )}
        </div>

        {onToggleSelect && (
          <button
            type="button"
            onClick={() => onToggleSelect(auction)}
            className={`absolute right-3 top-3 inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold backdrop-blur-sm transition-colors ${
              isSelected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-white/40 bg-white/90 text-brand-700 hover:bg-white"
            }`}
            aria-pressed={isSelected}
          >
            {isSelected && <Check size={12} />}
            {isSelected ? "Vald" : "Välj"}
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-brand-400">
          <span className="truncate">{auction.houseName}</span>
          <span>{auction.lotCount} lots</span>
        </div>

        <h2 className="mb-2 line-clamp-2 font-serif text-lg leading-tight text-brand-900">
          {auction.title}
        </h2>

        {auction.description && (
          <p className="mb-4 line-clamp-2 text-sm text-brand-500">
            {auction.description}
          </p>
        )}

        <div className="grid gap-2 rounded-xl bg-brand-50 px-3 py-3 text-sm text-brand-700">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-brand-500">
              <Clock3 size={14} /> Start
            </span>
            <span className="font-medium text-right text-brand-800">
              {formatAuctionDate(
                auction.effectiveStartTime ?? auction.startTime,
              )}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-brand-500">
              <Clock3 size={14} /> Slut
            </span>
            <span className="font-medium text-right text-brand-800">
              {formatAuctionDate(auction.effectiveEndTime ?? auction.endTime)}
            </span>
          </div>
        </div>

        {auction.lotDataIncomplete && (
          <p className="mt-3 text-xs text-amber-700">
            Lotantalet kan vara ofullständigt för den här auktionen just nu.
          </p>
        )}

        {auction.statusSource === "site-verified" && (
          <p className="mt-2 text-xs text-sky-700">
            Statusen är verifierad mot auktionssajten.
          </p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-4 sm:flex-row">
          {onToggleSelect && (
            <button
              type="button"
              onClick={() => onToggleSelect(auction)}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors sm:flex-1 ${
                isSelected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-brand-200 text-brand-700 hover:bg-brand-50"
              }`}
            >
              {isSelected && <Check size={16} />}
              {isSelected ? "Vald i urval" : "Lägg till i urval"}
            </button>
          )}

          <Link
            href={lotsLink}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-950"
          >
            <LayoutList size={16} />
            Visa föremål
          </Link>
          <a
            href={auction.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-200 px-4 py-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            Till auktionen <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </article>
  );
}
