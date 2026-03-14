"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { SearchHero } from "@/components/SearchHero";
import { StatsBar } from "@/components/StatsBar";
import { FilterBar } from "@/components/FilterBar";
import { LotGrid } from "@/components/LotGrid";
import { Pagination } from "@/components/Pagination";
import { AISearch } from "@/components/AISearch";
import { useSearch } from "@/hooks/use-search";
import { useFavorites } from "@/hooks/use-favorites";
import type { Lot, SearchStatus } from "@/lib/types";

const DEFAULT_AI_QUERIES = [
  "Finns det några skandinaviska designmöbler från 50-talet?",
  "Vad kan du hitta inom silver under 1000 kr?",
  "Jämför priserna på mattor just nu",
  "Vilka föremål slutar snart som är bra fynd?",
];

function buildAiSuggestedQueries(params: {
  query: string;
  selectedCategories: string[];
  selectedCity: string;
  selectedHouseLabel?: string;
  status: SearchStatus;
  minPrice?: number;
  maxPrice?: number;
  visibleLots: Lot[];
}) {
  const {
    query,
    selectedCategories,
    selectedCity,
    selectedHouseLabel,
    status,
    minPrice,
    maxPrice,
    visibleLots,
  } = params;

  const countTopValue = (values: Array<string | undefined>) => {
    const counts = new Map<string, number>();

    for (const value of values) {
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  };

  const inferredCategory = countTopValue(
    visibleLots.flatMap((lot) => lot.categories?.slice(0, 1) ?? []),
  );
  const inferredCity = countTopValue(visibleLots.map((lot) => lot.city));
  const inferredHouse = countTopValue(visibleLots.map((lot) => lot.houseName));

  const category = (selectedCategories[0] ?? inferredCategory)?.toLowerCase();
  const activeCity = selectedCity || inferredCity || "";
  const activeHouse = selectedHouseLabel || inferredHouse;
  const locationText = activeCity ? ` i ${activeCity}` : "";
  const houseText = activeHouse ? ` hos ${activeHouse}` : "";
  const statusQualifier =
    status === "ended"
      ? " bland avslutade objekt"
      : status === "all"
        ? " bland alla objekt"
        : " just nu";
  const priceText =
    minPrice != null || maxPrice != null
      ? ` mellan ${minPrice != null ? `${minPrice.toLocaleString("sv-SE")} kr` : "låga priser"} och ${maxPrice != null ? `${maxPrice.toLocaleString("sv-SE")} kr` : "övre spannet"}`
      : "";

  const suggestions: string[] = [];

  if (query) {
    suggestions.push(
      status === "ended"
        ? `Finns det fler avslutade föremål som liknar \"${query}\"?`
        : `Finns det fler föremål som liknar \"${query}\"?`,
    );
    suggestions.push(
      `Vilka är de mest intressanta träffarna för \"${query}\"${locationText}${houseText}${statusQualifier}?`,
    );
  }

  if (category) {
    if (status === "ended") {
      suggestions.push(
        `Jämför de senaste buden på ${category}${locationText}${houseText}`,
      );
      suggestions.push(
        `Vilka avslutade ${category} stack ut mest${locationText}${houseText}?`,
      );
    } else {
      suggestions.push(
        `Jämför priserna på ${category}${locationText}${houseText}`,
      );
      suggestions.push(
        `Vilka ${category} är mest intressanta just nu${locationText}${houseText}?`,
      );
    }
  }

  if (activeHouse) {
    suggestions.push(
      status === "ended"
        ? `Vilka avslutade objekt hos ${activeHouse} drog högst bud${priceText}?`
        : `Vad finns det för fynd hos ${activeHouse}${priceText}?`,
    );
  }

  if (activeCity) {
    suggestions.push(
      status === "ended"
        ? `Vad stack ut bland avslutade auktioner i ${activeCity}?`
        : `Vad sticker ut på auktionerna i ${activeCity} just nu?`,
    );
  }

  if (minPrice != null || maxPrice != null) {
    suggestions.push(
      status === "ended"
        ? `Vilka avslutade föremål fick mest intressanta bud${priceText}${locationText}${houseText}?`
        : `Vilka föremål är mest prisvärda${priceText}${locationText}${houseText}?`,
    );
  }

  const mergedSuggestions = Array.from(
    new Set([...suggestions, ...DEFAULT_AI_QUERIES]),
  );

  return mergedSuggestions.slice(0, 4);
}

function HomePage() {
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [pendingMobileResultsJump, setPendingMobileResultsJump] =
    useState(false);
  const {
    favorites,
    toggleFavorite,
    isFavorite,
    count: favCount,
  } = useFavorites();
  const {
    lots,
    total,
    loading,
    facets,
    stats,
    query,
    selectedCategories,
    selectedCity,
    selectedHouseId,
    hasBids,
    status,
    minPrice,
    maxPrice,
    sortBy,
    page,
    pageSize,
    searchMode,
    setQuery,
    setSearchMode,
    setStatus,
    toggleCategory,
    setCity,
    setHouseId,
    setHasBids,
    setMinPrice,
    setMaxPrice,
    setSortBy,
    setPage,
    clearFilters,
  } = useSearch({
    lotIds: showFavsOnly ? Array.from(favorites) : undefined,
  });

  const activeFilterCount =
    selectedCategories.length +
    (selectedCity ? 1 : 0) +
    (selectedHouseId ? 1 : 0) +
    (hasBids ? 1 : 0) +
    (status !== "active" ? 1 : 0) +
    (minPrice != null ? 1 : 0) +
    (maxPrice != null ? 1 : 0) +
    (showFavsOnly ? 1 : 0);

  const displayLots = lots;
  const soldPriceCount = displayLots.filter(
    (lot) => lot.soldPrice != null,
  ).length;
  const selectedHouseLabel = facets.houses.find(
    (house) => house.value === selectedHouseId,
  )?.label;
  const aiSuggestedQueries = buildAiSuggestedQueries({
    query,
    selectedCategories,
    selectedCity,
    selectedHouseLabel,
    status,
    minPrice,
    maxPrice,
    visibleLots: displayLots,
  });

  const scrollToResults = useCallback(() => {
    const resultsTop = document.getElementById("search-results-top");
    resultsTop?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
      requestAnimationFrame(() => {
        scrollToResults();
      });
    },
    [scrollToResults, setPage],
  );

  const submitSearchFromHero = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setPendingMobileResultsJump(true);
      return;
    }

    scrollToResults();
  }, [scrollToResults]);

  useEffect(() => {
    if (!pendingMobileResultsJump || loading) {
      return;
    }

    scrollToResults();
    setPendingMobileResultsJump(false);
  }, [loading, pendingMobileResultsJump, scrollToResults]);

  return (
    <div className="min-h-screen bg-brand-50">
      <Header
        favoritesCount={favCount}
        showFavsOnly={showFavsOnly}
        onToggleFavs={() => setShowFavsOnly(!showFavsOnly)}
      />

      <SearchHero
        query={query}
        onQueryChange={setQuery}
        searchMode={searchMode}
        onSearchModeChange={setSearchMode}
        total={total}
        loading={loading}
        onViewResults={scrollToResults}
        onSubmitSearch={submitSearchFromHero}
      />

      <main
        id="search-results-top"
        className="mx-auto max-w-[1360px] px-4 pb-20 sm:px-6"
      >
        {query.trim() && (
          <div className="sticky top-12 z-30 -mx-4 mb-3 border-b border-brand-200/70 bg-brand-50/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:hidden sm:border-b-0 sm:bg-transparent sm:px-0 sm:py-0">
            <div className="flex items-center justify-between gap-3 rounded-full border border-brand-200 bg-white px-3 py-2 shadow-card">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-400">
                  Resultat
                </p>
                <p className="truncate text-xs text-brand-800">
                  {loading
                    ? "Söker..."
                    : `${total.toLocaleString("sv-SE")} träffar för \"${query.trim()}\"`}
                </p>
              </div>
              <button
                type="button"
                onClick={scrollToResults}
                className="shrink-0 rounded-full bg-brand-900 px-3 py-1.5 text-[11px] font-semibold text-white"
              >
                Visa
              </button>
            </div>
          </div>
        )}

        <StatsBar
          lots={displayLots}
          total={total}
          status={status}
          windowCount={stats.windowCount}
        />

        {!loading &&
          status === "ended" &&
          soldPriceCount === 0 &&
          displayLots.length > 0 && (
            <div className="mb-6 rounded-xl border border-brand-200 bg-white px-4 py-4 text-sm text-brand-600 shadow-card sm:px-5">
              Slutpriser saknas i nuvarande feed-data för de här objekten.
              Därför visar vi sista kända bud i stället för faktiskt klubbslag
              när slutpris inte finns tillgängligt.
            </div>
          )}

        <FilterBar
          selectedCategories={selectedCategories}
          selectedCity={selectedCity}
          selectedHouseId={selectedHouseId}
          hasQuery={Boolean(query.trim())}
          hasBids={hasBids}
          status={status}
          minPrice={minPrice}
          maxPrice={maxPrice}
          sortBy={sortBy}
          categoryFacets={facets.categories}
          cityFacets={facets.cities}
          houseFacets={facets.houses}
          onToggleCategory={toggleCategory}
          onSetStatus={setStatus}
          onSetCity={setCity}
          onSetHouseId={setHouseId}
          onSetHasBids={setHasBids}
          onSetMinPrice={setMinPrice}
          onSetMaxPrice={setMaxPrice}
          onSetSort={setSortBy}
          onClearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          topPagination={
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={handlePageChange}
              className="!mt-0"
            />
          }
        />

        <LotGrid
          lots={displayLots}
          loading={loading}
          status={status}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={handlePageChange}
        />
      </main>

      {/* Floating AI Search */}
      <AISearch suggestedQueries={aiSuggestedQueries} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-50 flex items-center justify-center">
          <div className="animate-pulse text-brand-400 font-serif text-xl">
            Laddar Auktio...
          </div>
        </div>
      }
    >
      <HomePage />
    </Suspense>
  );
}
