"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Header } from "@/components/Header";
import { SearchHero } from "@/components/SearchHero";
import { StatsBar } from "@/components/StatsBar";
import { FilterBar } from "@/components/FilterBar";
import { LotGrid } from "@/components/LotGrid";
import { Pagination } from "@/components/Pagination";
import { useSearch } from "@/hooks/use-search";
import { useSearchSuggestions } from "@/hooks/use-search-suggestions";
import { useFavorites } from "@/hooks/use-favorites";
import { normalizeSearchText } from "@/lib/search-language";
import type { Lot, SearchStatus, SearchSuggestion } from "@/lib/types";

function getSuggestionStatusSubtitle(status: SearchStatus) {
  switch (status) {
    case "ended":
      return "Sök bland avslutade objekt";
    case "all":
      return "Sök bland alla objekt";
    case "active":
    default:
      return "Sök bland aktiva objekt";
  }
}

function buildResultDrivenSuggestions(lots: Lot[]): SearchSuggestion[] {
  const seen = new Set<string>();

  return lots
    .filter((lot) => Boolean(lot.title?.trim()))
    .filter((lot) => {
      const key = normalizeSearchText(lot.title ?? "");

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 4)
    .map((lot) => ({
      id: `result-lot:${lot.id}`,
      type: "lot" as const,
      label: lot.title,
      query: lot.title,
      subtitle: lot.houseName ? `Föremål hos ${lot.houseName}` : "Föremål",
    }));
}

export function HomePageClient() {
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [pendingMobileResultsJump, setPendingMobileResultsJump] =
    useState(false);
  const [showMobileTopShortcut, setShowMobileTopShortcut] = useState(false);
  const [mobileSuggestionsOpen, setMobileSuggestionsOpen] = useState(false);
  const [pendingResultsControlsScroll, setPendingResultsControlsScroll] =
    useState(false);
  const {
    favorites,
    toggleFavorite,
    openFavorites,
    isFavorite,
    count: favCount,
  } = useFavorites();
  const {
    lots,
    total,
    didYouMean,
    loading,
    facets,
    stats,
    query,
    selectedCategories,
    selectedAuctionIds,
    selectedAuctionTitles,
    selectedCity,
    selectedHouseId,
    hasBids,
    soldOnly,
    status,
    minPrice,
    maxPrice,
    sortBy,
    page,
    pageSize,
    setQuery,
    setStatus,
    toggleCategory,
    setCity,
    setHouseId,
    setHasBids,
    setSoldOnly,
    setMinPrice,
    setMaxPrice,
    setSortBy,
    setPage,
    setPageSize,
    clearFilters,
  } = useSearch({
    favoritesMode: showFavsOnly,
    lotIds: showFavsOnly ? Array.from(favorites) : undefined,
  });
  const { suggestions: remoteSuggestions, loading: suggestionsLoading } =
    useSearchSuggestions({
      query,
      status,
      selectedCategories,
      selectedCity,
      selectedHouseId,
    });

  const activeFilterCount = showFavsOnly
    ? 1
    : selectedCategories.length +
      (selectedAuctionIds.length > 0 ? 1 : 0) +
      (selectedCity ? 1 : 0) +
      (selectedHouseId ? 1 : 0) +
      (hasBids ? 1 : 0) +
      (soldOnly ? 1 : 0) +
      (status !== "active" ? 1 : 0) +
      (minPrice != null ? 1 : 0) +
      (maxPrice != null ? 1 : 0);

  const displayLots = lots;
  const soldPriceCount = displayLots.filter(
    (lot) => lot.soldPrice != null,
  ).length;
  const selectedHouseLabel = facets.houses.find(
    (house) => house.value === selectedHouseId,
  )?.label;
  const resultDrivenSuggestions = useMemo(
    () => buildResultDrivenSuggestions(displayLots),
    [displayLots],
  );
  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return [];
    }

    const directSuggestion: SearchSuggestion = {
      id: `query:${trimmedQuery.toLowerCase()}`,
      type: "query",
      label: `Sök efter \"${trimmedQuery}\"`,
      query: trimmedQuery,
      subtitle: getSuggestionStatusSubtitle(status),
    };

    const preferredSuggestions =
      resultDrivenSuggestions.length > 0
        ? resultDrivenSuggestions
        : remoteSuggestions;

    return Array.from(
      new Map(
        [directSuggestion, ...preferredSuggestions].map((suggestion) => [
          suggestion.id,
          suggestion,
        ]),
      ).values(),
    ).slice(0, 8);
  }, [query, remoteSuggestions, resultDrivenSuggestions, status]);

  const scrollToResults = useCallback(() => {
    const resultsTop = document.getElementById("search-results-top");
    resultsTop?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToResultsControls = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const controlsTop = document.getElementById(
      "search-results-top-pagination",
    );
    if (!controlsTop) {
      const fallbackControls = document.getElementById(
        "search-results-controls",
      );
      if (!fallbackControls) {
        scrollToResults();
        return;
      }

      const fallbackTop =
        fallbackControls.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({ top: fallbackTop, behavior: "smooth" });
      return;
    }

    const top = controlsTop.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top, behavior: "smooth" });
  }, [scrollToResults]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
      setPendingResultsControlsScroll(true);
    },
    [setPage],
  );

  const handleTopPageChange = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
    },
    [setPage],
  );

  const submitSearchFromHero = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setPendingMobileResultsJump(true);
    }
  }, []);

  const handleSuggestionSelect = useCallback(
    (suggestion: SearchSuggestion) => {
      setQuery(suggestion.query);

      if (typeof window !== "undefined" && window.innerWidth < 640) {
        setPendingMobileResultsJump(true);
      }
    },
    [setQuery],
  );

  const scrollToSearchTop = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const applyDidYouMean = useCallback(() => {
    if (!didYouMean) {
      return;
    }

    setQuery(didYouMean);
    scrollToSearchTop();
  }, [didYouMean, scrollToSearchTop, setQuery]);

  useEffect(() => {
    if (!pendingMobileResultsJump || loading) {
      return;
    }

    scrollToResults();
    setPendingMobileResultsJump(false);
  }, [loading, pendingMobileResultsJump, scrollToResults]);

  useEffect(() => {
    if (!pendingResultsControlsScroll || loading) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToResultsControls();
      setPendingResultsControlsScroll(false);
    });
  }, [loading, pendingResultsControlsScroll, scrollToResultsControls]);

  useEffect(() => {
    const updateMobileTopShortcut = () => {
      if (typeof window === "undefined") {
        return;
      }

      if (window.innerWidth >= 640) {
        setShowMobileTopShortcut(false);
        return;
      }

      setShowMobileTopShortcut(window.scrollY > 900);
    };

    updateMobileTopShortcut();
    window.addEventListener("scroll", updateMobileTopShortcut, {
      passive: true,
    });
    window.addEventListener("resize", updateMobileTopShortcut);

    return () => {
      window.removeEventListener("scroll", updateMobileTopShortcut);
      window.removeEventListener("resize", updateMobileTopShortcut);
    };
  }, []);

  return (
    <div className="min-h-screen bg-brand-50">
      <Header
        favoritesCount={favCount}
        showFavsOnly={showFavsOnly}
        onToggleFavs={async () => {
          if (showFavsOnly) {
            setShowFavsOnly(false);
            return;
          }

          const canOpenFavorites = await openFavorites();

          if (canOpenFavorites) {
            setShowFavsOnly(true);
          }
        }}
      />

      <SearchHero
        query={query}
        onQueryChange={setQuery}
        total={total}
        loading={loading}
        onViewResults={scrollToResults}
        onSubmitSearch={submitSearchFromHero}
        suggestions={searchSuggestions}
        suggestionsLoading={suggestionsLoading}
        onSuggestionSelect={handleSuggestionSelect}
        onSuggestionsOpenChange={setMobileSuggestionsOpen}
        onMobileSearchActivate={scrollToSearchTop}
      />

      {!showFavsOnly && (
        <div className="mx-auto max-w-[1360px] px-4 pt-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 bg-white px-4 py-3 text-[12px] text-brand-700 shadow-card">
            <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">
              Bevakningar
            </span>
            <span>Logga in för att bevaka objekt.</span>
            <span className="text-brand-500">
              Dina bevakningar sparas pa ditt konto och foljer med mellan enheter.
            </span>
          </div>
        </div>
      )}

      <main
        id="search-results-top"
        className="mx-auto max-w-[1360px] px-4 pb-20 sm:px-6"
      >
        {query.trim() && !mobileSuggestionsOpen && !showFavsOnly && (
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
          status={showFavsOnly ? "all" : status}
          windowCount={stats.windowCount}
          totalValue={stats.totalValue}
          totalValueCurrency={stats.totalValueCurrency}
          totalValueHasMixedCurrencies={stats.totalValueHasMixedCurrencies}
        />

        {showFavsOnly && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-white px-4 py-4 shadow-card sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-500">
                  Bevakade
                </p>
                <p className="mt-1 text-sm text-brand-800">
                  Visar dina bevakade föremål oavsett tidigare sökfilter och
                  statusval.
                </p>
                <p className="mt-1 text-[12px] text-brand-500">
                  Dina vanliga sökfilter ligger kvar i bakgrunden och kommer
                  tillbaka när du lämnar bevakade-läget.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFavsOnly(false)}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-[13px] font-medium text-brand-800 transition hover:border-brand-300 hover:bg-white"
              >
                Visa alla föremål
              </button>
            </div>
          </div>
        )}

        {!showFavsOnly && selectedAuctionIds.length > 0 && (
          <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 shadow-card sm:px-5">
            Visar föremål från{" "}
            {selectedAuctionTitles.length > 0
              ? selectedAuctionTitles.slice(0, 2).map((title, index) => (
                  <span key={title} className="font-semibold text-sky-950">
                    {index > 0 ? ", " : ""}
                    {title}
                    {selectedAuctionIds.length === 1 && selectedHouseLabel
                      ? ` · ${selectedHouseLabel}`
                      : ""}
                  </span>
                ))
              : `${selectedAuctionIds.length} vald${selectedAuctionIds.length === 1 ? " auktion" : "a auktioner"}`}
            {selectedAuctionTitles.length > 2 && (
              <span className="font-semibold text-sky-950">
                {` och ${selectedAuctionTitles.length - 2} till`}
              </span>
            )}
            .
            <button
              type="button"
              onClick={clearFilters}
              className="ml-2 font-semibold text-sky-900 underline underline-offset-2"
            >
              Rensa filtret
            </button>
          </div>
        )}

        {!showFavsOnly &&
          !loading &&
          status === "ended" &&
          soldPriceCount === 0 &&
          displayLots.length > 0 && (
            <div className="mb-6 rounded-xl border border-brand-200 bg-white px-4 py-4 text-sm text-brand-600 shadow-card sm:px-5">
              Slutpriser saknas i nuvarande feed-data för de här objekten.
              Därför visar vi sista kända bud i stället för faktiskt klubbslag
              när slutpris inte finns tillgängligt.
            </div>
          )}

        <div id="search-results-controls">
          {showFavsOnly ? (
            <div id="search-results-top-pagination">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={handleTopPageChange}
                onPageSizeChange={setPageSize}
                showPageSizeSelector
                className="!mt-0 mb-4"
              />
            </div>
          ) : (
            <FilterBar
              selectedCategories={selectedCategories}
              selectedCity={selectedCity}
              selectedHouseId={selectedHouseId}
              hasQuery={Boolean(query.trim())}
              hasBids={hasBids}
              soldOnly={soldOnly}
              status={status}
              minPrice={minPrice}
              maxPrice={maxPrice}
              sortBy={sortBy}
              pageSize={pageSize}
              categoryFacets={facets.categories}
              cityFacets={facets.cities}
              houseFacets={facets.houses}
              onToggleCategory={toggleCategory}
              onSetStatus={setStatus}
              onSetCity={setCity}
              onSetHouseId={setHouseId}
              onSetHasBids={setHasBids}
              onSetSoldOnly={setSoldOnly}
              onSetMinPrice={setMinPrice}
              onSetMaxPrice={setMaxPrice}
              onSetSort={setSortBy}
              onSetPageSize={setPageSize}
              onClearFilters={clearFilters}
              activeFilterCount={activeFilterCount}
              topPagination={
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={handleTopPageChange}
                  onPageSizeChange={setPageSize}
                  showPageSizeSelector
                  className="!mt-0"
                />
              }
            />
          )}
        </div>

        {!showFavsOnly &&
          !loading &&
          displayLots.length === 0 &&
          didYouMean && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-sm text-amber-900 shadow-card sm:px-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600">
                Menade du
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={applyDidYouMean}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm transition-colors hover:bg-amber-100"
                >
                  {didYouMean}
                </button>
                <p className="text-sm text-amber-800/80">
                  Tryck för att ersätta sökningen och prova igen.
                </p>
              </div>
            </div>
          )}

        {showFavsOnly && !loading && displayLots.length === 0 ? (
          <div className="rounded-3xl border border-brand-200 bg-white px-6 py-10 text-center shadow-card sm:px-8">
            <div className="mx-auto max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
                Bevakade
              </p>
              <h3 className="mt-3 font-serif text-2xl text-brand-900">
                Du har inga bevakade foremal an
              </h3>
              <p className="mt-3 text-sm leading-6 text-brand-600">
                Nar du markerar ett foremal med hjartat sparas det pa ditt konto
                och dyker upp har, oavsett vilken enhet du anvander.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowFavsOnly(false)}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-950"
                >
                  Utforska foremal
                </button>
                <button
                  type="button"
                  onClick={scrollToSearchTop}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-800 transition hover:border-brand-300 hover:bg-brand-50"
                >
                  Till sok och filter
                </button>
              </div>
            </div>
          </div>
        ) : (
          <LotGrid
            lots={displayLots}
            loading={loading}
            status={showFavsOnly ? "all" : status}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        )}

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={handlePageChange}
        />
      </main>

      <div
        className={`pointer-events-none fixed bottom-[5.25rem] right-4 z-40 transition-all duration-300 sm:hidden ${
          showMobileTopShortcut
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={scrollToSearchTop}
          className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-200/80 bg-white/95 px-4 py-2.5 text-[12px] font-semibold text-brand-900 shadow-[0_10px_28px_rgba(93,69,40,0.14)] backdrop-blur-md transition-colors hover:bg-white"
          aria-label="Till sök och filter högst upp"
        >
          <ArrowUp size={15} />
          <span>Sök & filter</span>
        </button>
      </div>
    </div>
  );
}
