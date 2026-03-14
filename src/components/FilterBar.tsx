"use client";

import type { ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { CATEGORY_ORDER } from "@/config/sources";
import type { SortOption, FacetCount, SearchStatus } from "@/lib/types";
import { formatSEK } from "@/lib/utils";

export interface HouseFacet extends FacetCount {
  label?: string;
}

interface FilterBarProps {
  selectedCategories: string[];
  selectedCity: string;
  selectedHouseId: string;
  hasQuery: boolean;
  hasBids: boolean;
  status: SearchStatus;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  sortBy: SortOption;
  categoryFacets: FacetCount[];
  cityFacets: FacetCount[];
  houseFacets: HouseFacet[];
  onToggleCategory: (cat: string) => void;
  onSetStatus: (status: SearchStatus) => void;
  onSetCity: (city: string) => void;
  onSetHouseId: (id: string) => void;
  onSetHasBids: (value: boolean) => void;
  onSetMinPrice: (v: number | undefined) => void;
  onSetMaxPrice: (v: number | undefined) => void;
  onSetSort: (sort: SortOption) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
  topPagination?: ReactNode;
}

const PRICE_MIN = 0;
const PRICE_MAX = 100_000;
const PRICE_STEP = 500;

export function FilterBar({
  selectedCategories,
  selectedCity,
  selectedHouseId,
  hasQuery,
  hasBids,
  status,
  minPrice,
  maxPrice,
  sortBy,
  categoryFacets,
  cityFacets,
  houseFacets,
  onToggleCategory,
  onSetStatus,
  onSetCity,
  onSetHouseId,
  onSetHasBids,
  onSetMinPrice,
  onSetMaxPrice,
  onSetSort,
  onClearFilters,
  activeFilterCount,
  topPagination,
}: FilterBarProps) {
  const [expandedFilters, setExpandedFilters] = useState(false);

  // Local slider state for responsive dragging (debounced to parent)
  const [localMin, setLocalMin] = useState(minPrice ?? PRICE_MIN);
  const [localMax, setLocalMax] = useState(maxPrice ?? PRICE_MAX);
  const debounceMinRef = useRef<NodeJS.Timeout | null>(null);
  const debounceMaxRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external → local
  useEffect(() => {
    setLocalMin(minPrice ?? PRICE_MIN);
  }, [minPrice]);
  useEffect(() => {
    setLocalMax(maxPrice ?? PRICE_MAX);
  }, [maxPrice]);

  const handleMinChange = useCallback(
    (val: number) => {
      const clamped = Math.min(val, localMax - PRICE_STEP);
      setLocalMin(clamped);
      if (debounceMinRef.current) clearTimeout(debounceMinRef.current);
      debounceMinRef.current = setTimeout(() => {
        onSetMinPrice(clamped <= PRICE_MIN ? undefined : clamped);
      }, 400);
    },
    [localMax, onSetMinPrice],
  );

  const handleMaxChange = useCallback(
    (val: number) => {
      const clamped = Math.max(val, localMin + PRICE_STEP);
      setLocalMax(clamped);
      if (debounceMaxRef.current) clearTimeout(debounceMaxRef.current);
      debounceMaxRef.current = setTimeout(() => {
        onSetMaxPrice(clamped >= PRICE_MAX ? undefined : clamped);
      }, 400);
    },
    [localMin, onSetMaxPrice],
  );

  // Merge known categories with facet counts
  const categoryPills = CATEGORY_ORDER.map((cat) => ({
    label: cat,
    count: categoryFacets.find((f) => f.value === cat)?.count ?? 0,
    active: selectedCategories.includes(cat),
  }))
    .filter((c) => c.count > 0 || c.active)
    .sort((a, b) => a.label.localeCompare(b.label, "sv-SE"));

  const selectedHouseLabel =
    houseFacets.find((h) => h.value === selectedHouseId)?.label ??
    selectedHouseId;
  const sortedHouseFacets = [...houseFacets].sort((a, b) =>
    (a.label ?? a.value).localeCompare(b.label ?? b.value, "sv-SE"),
  );
  const sortOptions = [
    ...(hasQuery ? [{ value: "relevance", label: "Relevans" }] : []),
    ...(status !== "ended"
      ? [{ value: "ending-soon", label: "Kortast tid kvar" }]
      : []),
    ...(status !== "active"
      ? [{ value: "recently-ended", label: "Senast avslutade" }]
      : []),
    { value: "newly-listed", label: "Senast inkommet" },
    { value: "price-desc", label: "Högsta bud" },
    { value: "price-asc", label: "Lägsta bud" },
    { value: "estimate-desc", label: "Högsta utrop" },
  ] as const;

  const hasClearableFilters = activeFilterCount > 0;

  return (
    <div className="space-y-3 mb-4">
      {/* Status + controls */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:justify-self-start">
          <div className="grid grid-cols-3 items-center rounded-2xl border border-brand-200 bg-white p-1 md:mr-1.5 md:flex md:rounded-full md:p-0.5">
            {(
              [
                { value: "active", label: "Aktiva" },
                { value: "ended", label: "Avslutade" },
                { value: "all", label: "Alla" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => onSetStatus(option.value)}
                className={`rounded-xl px-2.5 py-2 text-[12px] font-medium transition-colors md:rounded-full md:py-1 ${
                  status === option.value
                    ? "bg-brand-900 text-white"
                    : "text-brand-500 hover:text-brand-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {topPagination ? (
          <div className="hidden md:flex md:justify-self-center">
            {topPagination}
          </div>
        ) : (
          <div className="hidden md:block" />
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2 md:flex md:flex-wrap md:items-center md:justify-self-end md:justify-end">
          <button
            onClick={() => setExpandedFilters(!expandedFilters)}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 py-2
              text-[12px] font-medium text-brand-600
              hover:border-brand-400 transition-all"
          >
            <Filter size={14} />
            Filter
            {activeFilterCount > 0 && (
              <span className="bg-accent-500 text-white rounded-full px-2 py-px text-[11px] font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>

          <select
            value={sortBy}
            onChange={(e) => onSetSort(e.target.value as SortOption)}
            className="min-w-0 max-w-full rounded-xl border border-brand-200 bg-white px-3 py-2
              text-[12px] text-brand-600 outline-none cursor-pointer md:min-w-[9rem] md:rounded-lg md:py-1.5"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            onClick={onClearFilters}
            disabled={!hasClearableFilters}
            className="col-span-2 px-2 py-1 text-center text-xs text-brand-400 transition-colors hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 md:col-auto"
          >
            Rensa alla
          </button>
        </div>

        {topPagination && (
          <div className="flex justify-center md:hidden">{topPagination}</div>
        )}
      </div>

      {/* Expanded filter panel */}
      {expandedFilters && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-brand-200/60 bg-white p-4 shadow-card animate-fade-in md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)_auto]">
          {/* Categories */}
          <div className="md:col-span-3">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-brand-400">
              Kategorier
            </label>
            <div className="flex flex-wrap gap-2">
              {categoryPills.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => onToggleCategory(cat.label)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all whitespace-nowrap
                    ${
                      cat.active
                        ? "border-brand-900 bg-brand-900 text-white"
                        : "border-brand-200 bg-white text-brand-600 hover:border-brand-400 hover:text-brand-900"
                    }`}
                >
                  {cat.label}
                  <span
                    className={`rounded-md px-1.5 py-px text-[11px] ${cat.active ? "bg-white/20" : "bg-brand-100"}`}
                  >
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Auction house */}
          <div>
            <label className="block text-[11px] font-semibold text-brand-400 uppercase tracking-wider mb-2">
              Auktionshus
            </label>
            <select
              value={selectedHouseId}
              onChange={(e) => onSetHouseId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-brand-200 bg-brand-50
                text-sm text-brand-900 outline-none"
            >
              <option value="">Alla auktionshus</option>
              {sortedHouseFacets.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label ?? h.value} ({h.count})
                </option>
              ))}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="block text-[11px] font-semibold text-brand-400 uppercase tracking-wider mb-2">
              Stad
            </label>
            <select
              value={selectedCity}
              onChange={(e) => onSetCity(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-brand-200 bg-brand-50
                text-sm text-brand-900 outline-none"
            >
              <option value="">Alla städer</option>
              {cityFacets.map((city) => (
                <option key={city.value} value={city.value}>
                  {city.value} ({city.count})
                </option>
              ))}
            </select>
          </div>

          {/* Has bids */}
          <div className="md:min-w-[140px]">
            <label className="block text-[11px] font-semibold text-brand-400 uppercase tracking-wider mb-2">
              Budstatus
            </label>
            <button
              type="button"
              onClick={() => onSetHasBids(!hasBids)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                hasBids
                  ? "border-brand-900 bg-brand-900 text-white"
                  : "border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300"
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  hasBids ? "bg-white" : "bg-brand-300"
                }`}
              />
              <span>Har bud</span>
            </button>
          </div>

          {/* Price range slider */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-semibold text-brand-400 uppercase tracking-wider mb-2">
              Prisintervall
            </label>
            <div className="px-1">
              <div className="relative h-8 flex items-center">
                {/* Track background */}
                <div className="absolute inset-x-0 h-1.5 bg-brand-100 rounded-full" />
                {/* Active range */}
                <div
                  className="absolute h-1.5 bg-accent-500 rounded-full"
                  style={{
                    left: `${(localMin / PRICE_MAX) * 100}%`,
                    right: `${100 - (localMax / PRICE_MAX) * 100}%`,
                  }}
                />
                {/* Min thumb */}
                <input
                  type="range"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  step={PRICE_STEP}
                  value={localMin}
                  onChange={(e) => handleMinChange(Number(e.target.value))}
                  className="range-thumb absolute inset-x-0"
                />
                {/* Max thumb */}
                <input
                  type="range"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  step={PRICE_STEP}
                  value={localMax}
                  onChange={(e) => handleMaxChange(Number(e.target.value))}
                  className="range-thumb absolute inset-x-0"
                />
              </div>
              <div className="flex justify-between text-[11px] text-brand-400 mt-1">
                <span>{formatSEK(localMin)}</span>
                <span>
                  {localMax >= PRICE_MAX ? "100 000+ kr" : formatSEK(localMax)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
