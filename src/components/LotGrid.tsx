"use client";

import { LotCard } from "./LotCard";
import { MobileLotCard } from "./MobileLotCard";
import { MobileLotListRow } from "./MobileLotListRow";
import type { Lot, SearchStatus } from "@/lib/types";

interface LotGridProps {
  lots: Lot[];
  loading: boolean;
  loadingMore?: boolean;
  status: SearchStatus;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (id: number) => void | Promise<void>;
  viewMode?: "grid" | "list";
  relatedCategories?: string[];
  onRelatedCategorySelect?: (category: string) => void;
  onCategorySelect?: (category: string) => void;
  onHouseSelect?: (houseId: string) => void;
}

export function LotGrid({
  lots,
  loading,
  loadingMore = false,
  status,
  isFavorite,
  onToggleFavorite,
  viewMode = "grid",
  relatedCategories = [],
  onRelatedCategorySelect,
  onCategorySelect,
  onHouseSelect,
}: LotGridProps) {
  if (loading && lots.length === 0) {
    return (
      <>
        <div
          className={`sm:hidden ${
            viewMode === "list" ? "space-y-3" : "grid grid-cols-2 gap-2"
          }`}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className={`overflow-hidden rounded-lg border border-brand-200/60 bg-white animate-pulse ${
                viewMode === "list" ? "flex gap-3 p-2" : ""
              }`}
            >
              <div
                className={
                  viewMode === "list"
                    ? "h-24 w-24 shrink-0 rounded-lg bg-brand-100"
                    : "aspect-square bg-brand-100"
                }
              />
              <div
                className={
                  viewMode === "list"
                    ? "flex-1 space-y-2 py-1"
                    : "space-y-2 p-2.5"
                }
              >
                <div className="h-3 rounded bg-brand-100" />
                <div className="h-3 w-4/5 rounded bg-brand-100" />
                <div className="h-4 w-1/2 rounded bg-brand-100" />
              </div>
            </div>
          ))}
        </div>

        <div className="hidden grid-cols-1 gap-4 sm:grid sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-brand-200/40 bg-white animate-pulse"
            >
              <div className="aspect-[4/3] bg-brand-100" />
              <div className="space-y-3 p-4">
                <div className="h-3 w-1/3 rounded bg-brand-100" />
                <div className="h-4 w-full rounded bg-brand-100" />
                <div className="h-4 w-2/3 rounded bg-brand-100" />
                <div className="flex justify-between border-t border-brand-100 pt-3">
                  <div className="h-5 w-20 rounded bg-brand-100" />
                  <div className="h-4 w-16 rounded bg-brand-100" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (!loading && lots.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-200/80 bg-white px-5 py-12 text-center shadow-card sm:px-8 sm:py-20">
        <h3 className="mb-2 text-xl font-semibold text-brand-700">
          Inga föremål hittades
        </h3>
        <p className="text-sm text-brand-500">
          {status === "ended"
            ? "Prova att visa alla eller bredda filtren för avslutade objekt"
            : "Prova att ändra dina filter eller sökord"}
        </p>

        {relatedCategories.length > 0 && onRelatedCategorySelect ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {relatedCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => onRelatedCategorySelect(category)}
                className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-white"
              >
                {category}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`sm:hidden ${
          viewMode === "list" ? "space-y-3" : "grid grid-cols-2 gap-2"
        }`}
      >
        {lots.map((lot) =>
          viewMode === "list" ? (
            <MobileLotListRow
              key={lot.id}
              lot={lot}
              isFavorite={isFavorite(lot.id)}
              onToggleFavorite={onToggleFavorite}
              onCategorySelect={onCategorySelect}
              onHouseSelect={onHouseSelect}
            />
          ) : (
            <MobileLotCard
              key={lot.id}
              lot={lot}
              isFavorite={isFavorite(lot.id)}
              onToggleFavorite={onToggleFavorite}
              onCategorySelect={onCategorySelect}
              onHouseSelect={onHouseSelect}
            />
          ),
        )}
      </div>

      <div className="hidden grid-cols-1 gap-4 sm:grid sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {lots.map((lot, index) => (
          <LotCard
            key={lot.id}
            lot={lot}
            isFavorite={isFavorite(lot.id)}
            onToggleFavorite={onToggleFavorite}
            imagePriority={index < 4}
            onCategorySelect={onCategorySelect}
            onHouseSelect={onHouseSelect}
          />
        ))}
      </div>

      {loadingMore ? (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-brand-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
          Laddar fler objekt...
        </div>
      ) : null}
    </div>
  );
}
