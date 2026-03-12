"use client";

import { Heart } from "lucide-react";
import Link from "next/link";

interface HeaderProps {
  favoritesCount: number;
  showFavsOnly: boolean;
  onToggleFavs: () => void;
}

export function Header({
  favoritesCount,
  showFavsOnly,
  onToggleFavs,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-brand-900 border-b border-white/5">
      <div className="max-w-[1360px] mx-auto px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="w-2 h-2 rounded-full bg-accent-500 group-hover:scale-125 transition-transform" />
          <span className="font-serif text-[22px] font-semibold text-white/95 tracking-tight">
            Auktio
          </span>
        </Link>

        {/* Nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleFavs}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all
              ${
                showFavsOnly
                  ? "bg-accent-500 text-white"
                  : "bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-white/[0.12] hover:text-white"
              }`}
          >
            <Heart size={14} fill={showFavsOnly ? "currentColor" : "none"} />
            Bevakade
            {favoritesCount > 0 && (
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                {favoritesCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
