"use client";

import { Search, Sparkles, Layers, Brain, X } from "lucide-react";
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
  total: number;
  loading: boolean;
  onViewResults: () => void;
  onSubmitSearch: () => void;
}

export function SearchHero({
  query,
  onQueryChange,
  searchMode,
  onSearchModeChange,
  total,
  loading,
  onViewResults,
  onSubmitSearch,
}: SearchHeroProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = query.trim().length > 0;

  const clearQuery = () => {
    onQueryChange("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && hasQuery) {
      onSubmitSearch();
    }
  };

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
    <section className="bg-gradient-to-b from-brand-900 via-brand-950 to-brand-50 px-4 pt-3 pb-7 text-center sm:px-6 sm:pt-4 sm:pb-8">
      <h1 className="mb-2 font-serif text-[28px] font-medium leading-[1.02] tracking-tight text-white/95 sm:text-[38px] sm:leading-[1.06]">
        Alla Sveriges auktioner,
        <br />
        ett intelligent sök
      </h1>
      <p className="mx-auto mb-4 max-w-[30rem] text-[13px] font-light text-white/50 sm:mb-5 sm:text-[15px]">
        Sök bland tusentals föremål från landets främsta auktionshus
      </p>

      <div className="mb-3 flex justify-center overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1.5">
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onSearchModeChange(value)}
              className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all sm:min-h-9 sm:px-3.5 sm:text-xs ${
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
          size={17}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand-400 sm:left-[18px] sm:size-5"
        />
        <input
          ref={inputRef}
          type="text"
          className="w-full rounded-2xl border-2 border-transparent bg-white py-2.5 pl-11 pr-12 text-sm text-brand-900 placeholder:text-brand-400 shadow-elevated-lg outline-none transition-all focus:border-accent-500 focus:shadow-[0_12px_40px_rgba(26,26,24,0.1),0_0_0_4px_theme(colors.accent.100)] sm:py-3 sm:pl-[52px] sm:pr-[152px] sm:text-base"
          placeholder={
            searchMode === "keyword"
              ? "Sök föremål, kategori, konstnär..."
              : "Beskriv vad du letar efter..."
          }
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {searchMode !== "keyword" && (
            <span className="hidden bg-gold-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-gold-500 sm:flex sm:items-center sm:gap-1">
              <Sparkles size={12} />
              AI-sök
            </span>
          )}
          {hasQuery && (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="Rensa sökning"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-brand-400 transition-colors hover:bg-brand-100 hover:text-brand-700"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {hasQuery && (
        <div className="mx-auto mt-3 flex max-w-[680px] items-center justify-center gap-2 sm:hidden">
          <div className="rounded-full bg-white/12 px-3 py-1.5 text-[11px] font-medium text-white/88 backdrop-blur">
            {loading ? "Söker..." : `${total.toLocaleString("sv-SE")} träffar`}
          </div>
          <button
            type="button"
            onClick={onViewResults}
            className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-900 shadow-sm transition-colors hover:bg-brand-100"
          >
            Visa resultat
          </button>
        </div>
      )}
    </section>
  );
}
