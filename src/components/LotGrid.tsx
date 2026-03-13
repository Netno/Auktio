"use client";

import { LotCard } from "./LotCard";
import type { Lot, SearchStatus } from "@/lib/types";

interface LotGridProps {
  lots: Lot[];
  loading: boolean;
  status: SearchStatus;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (id: number) => void;
}

export function LotGrid({
  lots,
  loading,
  status,
  isFavorite,
  onToggleFavorite,
}: LotGridProps) {
  // Loading skeleton
  if (loading && lots.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-brand-200/40 overflow-hidden animate-pulse"
          >
            <div className="aspect-[4/3] bg-brand-100" />
            <div className="p-4 space-y-3">
              <div className="h-3 bg-brand-100 rounded w-1/3" />
              <div className="h-4 bg-brand-100 rounded w-full" />
              <div className="h-4 bg-brand-100 rounded w-2/3" />
              <div className="pt-3 border-t border-brand-100 flex justify-between">
                <div className="h-5 bg-brand-100 rounded w-20" />
                <div className="h-4 bg-brand-100 rounded w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (!loading && lots.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="font-serif text-xl text-brand-600 mb-2">
          Inga föremål hittades
        </h3>
        <p className="text-brand-400 text-sm">
          {status === "ended"
            ? "Prova att visa alla eller bredda filtren för avslutade objekt"
            : "Prova att ändra dina filter eller sökord"}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
      {lots.map((lot, index) => (
        <LotCard
          key={lot.id}
          lot={lot}
          isFavorite={isFavorite(lot.id)}
          onToggleFavorite={onToggleFavorite}
          imagePriority={index < 4}
        />
      ))}
    </div>
  );
}
