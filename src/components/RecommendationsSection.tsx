"use client";

import { RefreshCcw, Sparkles } from "lucide-react";
import { LotGrid } from "@/components/LotGrid";
import type { Lot } from "@/lib/types";

type RecommendationPriceRange = {
  min?: number;
  max?: number;
  suggestedMin?: number;
  suggestedMax?: number;
};

interface RecommendationsSectionProps {
  lots: Lot[];
  loading: boolean;
  errorMessage: string | null;
  topCategories: string[];
  sourceBreakdown: Record<string, unknown>;
  avgPriceRange: RecommendationPriceRange;
  updatedAt: string | null;
  refreshed: boolean;
  isFavorite: (lotId: number) => boolean;
  onToggleFavorite: (lotId: number) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  viewMode: "grid" | "list";
  sectionId?: string;
}

function formatNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("sv-SE")
    : null;
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPriceRange(range: RecommendationPriceRange) {
  if (
    typeof range.suggestedMin === "number" &&
    typeof range.suggestedMax === "number"
  ) {
    return `${range.suggestedMin.toLocaleString("sv-SE")}–${range.suggestedMax.toLocaleString("sv-SE")} SEK`;
  }

  return null;
}

export function RecommendationsSection({
  lots,
  loading,
  errorMessage,
  topCategories,
  sourceBreakdown,
  avgPriceRange,
  updatedAt,
  refreshed,
  isFavorite,
  onToggleFavorite,
  onRefresh,
  viewMode,
  sectionId,
}: RecommendationsSectionProps) {
  const activeFavoriteCount = formatNumber(sourceBreakdown.activeFavoriteCount);
  const soldFavoriteCount = formatNumber(sourceBreakdown.soldFavoriteCount);
  const searchCount = formatNumber(sourceBreakdown.searchCount);
  const priceRangeLabel = formatPriceRange(avgPriceRange);
  const updatedAtLabel = formatUpdatedAt(updatedAt);

  return (
    <section
      id={sectionId}
      className="rounded-2xl border border-brand-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,241,235,0.96))] p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-700">
            <Sparkles size={13} />
            För dig
          </div>
          <h2 className="mt-3 text-lg font-semibold leading-tight text-brand-950 sm:text-xl">
            Personliga rekommendationer
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-brand-700">
            Bygger på dina bevakningar och meningsfulla sökningar, men ligger nu
            som ett valbart lager ovanpå sökflödet i stället för att ta över
            resultatsidan direkt.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <RefreshCcw size={14} />
            Uppdatera nu
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {topCategories.slice(0, 6).map((category) => (
          <span
            key={category}
            className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-[12px] font-medium text-brand-800"
          >
            {category}
          </span>
        ))}
        {priceRangeLabel ? (
          <span className="rounded-full border border-gold-200 bg-gold-50 px-3 py-1.5 text-[12px] font-medium text-gold-900">
            Prisprofil: {priceRangeLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-brand-600">
        {activeFavoriteCount ? (
          <span className="rounded-full bg-white px-3 py-1.5">
            Aktiva favoriter: {activeFavoriteCount}
          </span>
        ) : null}
        {soldFavoriteCount ? (
          <span className="rounded-full bg-white px-3 py-1.5">
            Sålda favoriter: {soldFavoriteCount}
          </span>
        ) : null}
        {searchCount ? (
          <span className="rounded-full bg-white px-3 py-1.5">
            Sökningar i profilen: {searchCount}
          </span>
        ) : null}
        {updatedAtLabel ? (
          <span className="rounded-full bg-white px-3 py-1.5">
            {refreshed ? "Nyss uppdaterad" : "Senast beräknad"}:{" "}
            {updatedAtLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-[18rem] animate-pulse rounded-[22px] border border-brand-200 bg-white/80"
              />
            ))}
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
            <p className="font-medium">Kunde inte ladda För dig just nu.</p>
            <p className="mt-1 text-rose-800/80">{errorMessage}</p>
          </div>
        ) : lots.length === 0 ? (
          <div className="rounded-2xl border border-brand-200 bg-white px-5 py-6 text-sm text-brand-700">
            Vi har inte tillräckligt med signaler för att visa relevanta
            rekommendationer ännu. Fortsätt söka och bevaka några objekt så
            fylls ytan på.
          </div>
        ) : (
          <LotGrid
            lots={lots}
            loading={false}
            status="all"
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
            viewMode={viewMode}
          />
        )}
      </div>
    </section>
  );
}
