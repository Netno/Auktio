"use client";

import { Search, Sparkles, Layers, Brain } from "lucide-react";
import { useRef, useEffect } from "react";
import type { SearchMode } from "@/lib/types";

const MODES: { value: SearchMode; label: string; icon: React.ElementType }[] = [
  { value: "keyword", label: "Nyckelord", icon: Search },
  { value: "vector", label: "Semantisk", icon: Brain },
  { value: "hybrid", label: "Hybrid", icon: Layers },
];

interface SearchHeroProps {
  query: string;
  onQueryChange: (q: string) => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
}

export function SearchHero({
  query,
  onQueryChange,
  searchMode,
  onSearchModeChange,
}: SearchHeroProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on "/" key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <section className="bg-gradient-to-b from-brand-900 via-brand-950 to-brand-50 px-4 pt-8 pb-12 text-center sm:px-6 sm:pt-12 sm:pb-16">
      <h1 className="mb-3 font-serif text-[30px] font-medium leading-[1.05] tracking-tight text-white/95 sm:text-[42px] sm:leading-[1.1]">
        Alla Sveriges auktioner,
        <br />
        ett intelligent sök
      </h1>
      <p className="mx-auto mb-6 max-w-[32rem] text-sm font-light text-white/50 sm:mb-8 sm:text-base">
        Sök bland tusentals föremål från landets främsta auktionshus
      </p>

      {/* Search mode tabs */}
      <div className="mb-4 flex justify-center overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1.5">
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onSearchModeChange(value)}
              className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:px-3.5 ${
                searchMode === value
                  ? "bg-white text-brand-900 shadow-sm"
                  : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white/80"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mx-auto max-w-[680px]">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand-400 sm:left-[18px] sm:size-5"
        />
        <input
          ref={inputRef}
          type="text"
          className="w-full rounded-2xl bg-white py-3 pl-11 pr-4 text-sm
            text-brand-900 placeholder:text-brand-400 shadow-elevated-lg
            border-2 border-transparent focus:border-accent-500
            focus:shadow-[0_12px_40px_rgba(26,26,24,0.1),0_0_0_4px_theme(colors.accent.100)]
            outline-none transition-all sm:py-4 sm:pl-[52px] sm:pr-[100px] sm:text-base"
          placeholder={
            searchMode === "keyword"
              ? "Sök föremål, kategori, konstnär..."
              : "Beskriv vad du letar efter..."
          }
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {searchMode !== "keyword" && (
          <span
            className="absolute right-3.5 top-1/2 hidden -translate-y-1/2
            bg-gold-50 text-gold-500 px-2.5 py-1 rounded-full
            text-[11px] font-semibold tracking-wide sm:flex sm:items-center sm:gap-1"
          >
            <Sparkles size={12} />
            AI-sök
          </span>
        )}
      </div>
    </section>
  );
}
