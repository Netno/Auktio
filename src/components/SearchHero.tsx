"use client";

import {
  Brain,
  Building2,
  ChevronRight,
  Layers,
  Search,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { SearchMode, SearchSuggestion } from "@/lib/types";

const MODES: { value: SearchMode; label: string; icon: ElementType }[] = [
  { value: "keyword", label: "Nyckelord", icon: Search },
  { value: "vector", label: "Semantisk", icon: Brain },
  { value: "hybrid", label: "Hybrid", icon: Layers },
];

function getSuggestionIcon(type: SearchSuggestion["type"]) {
  switch (type) {
    case "house":
      return Building2;
    case "category":
      return Tag;
    case "lot":
    case "query":
    default:
      return Search;
  }
}

function getSuggestionTypeLabel(type: SearchSuggestion["type"]) {
  switch (type) {
    case "house":
      return "Hus";
    case "category":
      return "Kategori";
    case "lot":
      return "Föremål";
    case "query":
    default:
      return "Sök";
  }
}

interface SearchHeroProps {
  query: string;
  onQueryChange: (q: string) => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  total: number;
  loading: boolean;
  onViewResults: () => void;
  onSubmitSearch: () => void;
  suggestions: SearchSuggestion[];
  suggestionsLoading: boolean;
  onSuggestionSelect: (suggestion: SearchSuggestion) => void;
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
  suggestions,
  suggestionsLoading,
  onSuggestionSelect,
}: SearchHeroProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const hasQuery = query.trim().length > 0;
  const visibleSuggestions = useMemo(
    () => (hasQuery ? suggestions : []),
    [hasQuery, suggestions],
  );

  const clearQuery = () => {
    onQueryChange("");
    setIsSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    inputRef.current?.focus();
  };

  const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
    onSuggestionSelect(suggestion);
    setIsSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && visibleSuggestions.length > 0) {
      e.preventDefault();
      setIsSuggestionsOpen(true);
      setActiveSuggestionIndex((current) =>
        current >= visibleSuggestions.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (e.key === "ArrowUp" && visibleSuggestions.length > 0) {
      e.preventDefault();
      setIsSuggestionsOpen(true);
      setActiveSuggestionIndex((current) =>
        current <= 0 ? visibleSuggestions.length - 1 : current - 1,
      );
      return;
    }

    if (
      e.key === "Enter" &&
      isSuggestionsOpen &&
      activeSuggestionIndex >= 0 &&
      activeSuggestionIndex < visibleSuggestions.length
    ) {
      e.preventDefault();
      handleSuggestionSelect(visibleSuggestions[activeSuggestionIndex]);
      return;
    }

    if (e.key === "Escape") {
      setIsSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }

    if (e.key === "Enter" && hasQuery) {
      setIsSuggestionsOpen(false);
      onSubmitSearch();
    }
  };

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!hasQuery) {
      setIsSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
    }
  }, [hasQuery]);

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [query, visibleSuggestions.length]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsSuggestionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
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

      <div ref={wrapperRef} className="relative mx-auto max-w-[680px]">
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
          onChange={(e) => {
            onQueryChange(e.target.value);
            setIsSuggestionsOpen(true);
          }}
          onFocus={() => {
            if (hasQuery) {
              setIsSuggestionsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          aria-expanded={isSuggestionsOpen}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
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

        {hasQuery && isSuggestionsOpen && (
          <div
            id="search-suggestions"
            className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[1.4rem] border border-brand-200/80 bg-white/95 text-left shadow-[0_24px_60px_rgba(26,26,24,0.18)] backdrop-blur"
          >
            <div className="flex items-center justify-between border-b border-brand-100 px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
                Sökförslag
              </p>
              <p className="text-[11px] text-brand-400">
                {suggestionsLoading ? "Uppdaterar..." : "Pil upp/ner • Enter"}
              </p>
            </div>

            <div className="max-h-[356px] overflow-y-auto py-1.5">
              {visibleSuggestions.map((suggestion, index) => {
                const Icon = getSuggestionIcon(suggestion.type);
                const isActive = index === activeSuggestionIndex;

                return (
                  <button
                    key={suggestion.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSuggestionSelect(suggestion)}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isActive
                        ? "bg-brand-900 text-white"
                        : "text-brand-900 hover:bg-brand-50"
                    }`}
                  >
                    <span
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
                        isActive
                          ? "bg-white/14 text-white"
                          : "bg-brand-50 text-brand-500"
                      }`}
                    >
                      <Icon size={16} />
                    </span>

                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium">
                          {suggestion.label}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                            isActive
                              ? "bg-white/12 text-white/82"
                              : "bg-brand-100 text-brand-500"
                          }`}
                        >
                          {getSuggestionTypeLabel(suggestion.type)}
                        </span>
                      </span>
                      {suggestion.subtitle && (
                        <span
                          className={`mt-0.5 block truncate text-[12px] ${
                            isActive ? "text-white/72" : "text-brand-500"
                          }`}
                        >
                          {suggestion.subtitle}
                        </span>
                      )}
                    </span>

                    <ChevronRight
                      size={16}
                      className={isActive ? "text-white/72" : "text-brand-300"}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
