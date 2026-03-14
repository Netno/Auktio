"use client";

import { Heart } from "lucide-react";
import Link from "next/link";

interface HeaderProps {
  favoritesCount?: number;
  showFavsOnly?: boolean;
  onToggleFavs?: () => void;
  activeView?: "lots" | "auctions";
}

export function Header({
  favoritesCount,
  showFavsOnly,
  onToggleFavs,
  activeView = "lots",
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-brand-900 border-b border-white/5">
      <div className="mx-auto max-w-[1360px] px-4 py-2 sm:flex sm:h-14 sm:items-center sm:justify-between sm:px-6 sm:py-0">
        <div className="flex items-center justify-between gap-3 sm:contents">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="h-2 w-2 rounded-full bg-accent-500 transition-transform group-hover:scale-125" />
            <span className="font-serif text-[18px] font-semibold tracking-tight text-white/95 sm:text-[20px]">
              Auktio
            </span>
          </Link>

          {onToggleFavs && (
            <button
              onClick={onToggleFavs}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all sm:hidden ${
                showFavsOnly
                  ? "bg-accent-500 text-white"
                  : "border border-white/[0.08] bg-white/[0.06] text-white/75"
              }`}
            >
              <Heart size={14} fill={showFavsOnly ? "currentColor" : "none"} />
              <span>Bevakade</span>
              {(favoritesCount ?? 0) > 0 && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                  {favoritesCount}
                </span>
              )}
            </button>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:items-center sm:gap-2">
          <Link
            href="/"
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-all sm:min-h-9 sm:rounded-lg sm:px-4 sm:py-1.5 ${
              activeView === "lots"
                ? "bg-white text-brand-900"
                : "border border-white/[0.08] bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"
            }`}
          >
            Föremål
          </Link>

          <Link
            href="/auctions"
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-all sm:min-h-9 sm:rounded-lg sm:px-4 sm:py-1.5 ${
              activeView === "auctions"
                ? "bg-white text-brand-900"
                : "border border-white/[0.08] bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"
            }`}
          >
            Auktioner
          </Link>

          {onToggleFavs && (
            <button
              onClick={onToggleFavs}
              className={`hidden sm:inline-flex sm:min-h-9 sm:items-center sm:gap-2 sm:rounded-lg sm:px-4 sm:py-1.5 sm:text-[13px] sm:font-medium sm:transition-all ${
                showFavsOnly
                  ? "bg-accent-500 text-white"
                  : "border border-white/[0.08] bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"
              }`}
            >
              <Heart size={14} fill={showFavsOnly ? "currentColor" : "none"} />
              <span>Bevakade</span>
              {(favoritesCount ?? 0) > 0 && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                  {favoritesCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
