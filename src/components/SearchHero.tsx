"use client";

import { Search, Sparkles, Zap, Layers, Brain } from "lucide-react";
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
    <section className="bg-gradient-to-b from-brand-900 via-brand-950 to-brand-50 px-6 pt-12 pb-16 text-center">
      <h1 className="font-serif text-[42px] font-medium text-white/95 mb-3 tracking-tight leading-[1.1]">
        Alla Sveriges auktioner,
        <br />
        ett intelligent sök
      </h1>
      <p className="text-white/40 text-base mb-8 font-light">
        Sök bland tusentals föremål från landets främsta auktionshus
      </p>

      {/* Search mode tabs */}
      <div className="flex justify-center gap-1.5 mb-4">
        {MODES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => onSearchModeChange(value)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
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

      <div className="max-w-[680px] mx-auto relative">
        <Search
          size={20}
          className="absolute left-[18px] top-1/2 -translate-y-1/2 text-brand-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          className="w-full bg-white rounded-2xl pl-[52px] pr-[100px] py-4 text-base
            text-brand-900 placeholder:text-brand-400 shadow-elevated-lg
            border-2 border-transparent focus:border-accent-500
            focus:shadow-[0_12px_40px_rgba(26,26,24,0.1),0_0_0_4px_theme(colors.accent.100)]
            outline-none transition-all"
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
            className="absolute right-3.5 top-1/2 -translate-y-1/2
            bg-gold-50 text-gold-500 px-2.5 py-1 rounded-full
            text-[11px] font-semibold flex items-center gap-1 tracking-wide"
          >
            <Sparkles size={12} />
            AI-sök
          </span>
        )}
      </div>
    </section>
  );
}
