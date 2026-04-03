"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  Clock3,
  Heart,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  Rows3,
  Search,
  SlidersHorizontal,
  TrendingUp,
  User2,
  X,
} from "lucide-react";
import { BrowseAuthSheet } from "@/components/BrowseAuthSheet";
import { FilterBar } from "@/components/FilterBar";
import { Header } from "@/components/Header";
import { LotGrid } from "@/components/LotGrid";
import { SearchHero } from "@/components/SearchHero";
import { StatsBar } from "@/components/StatsBar";
import { CATEGORY_ORDER } from "@/config/sources";
import { useFavorites } from "@/hooks/use-favorites";
import { useSearch } from "@/hooks/use-search";
import { useSearchSuggestions } from "@/hooks/use-search-suggestions";
import { normalizeSearchText } from "@/lib/search-language";
import type {
  Lot,
  SearchStatus,
  SearchSuggestion,
  SortOption,
} from "@/lib/types";

const RECENT_SEARCHES_STORAGE_KEY = "auktio_recent_searches";
const MOBILE_VIEW_MODE_STORAGE_KEY = "auktio_mobile_view_mode";
const MOBILE_HEADER_HEIGHT = 50;
const MOBILE_FILTER_BAR_HEIGHT = 48;

type MobileViewMode = "grid" | "list";
type AuthSheetKind = "favorite" | "favorites";

interface HomePageClientProps {
  canAccessRecommendations?: boolean;
}

function getDisplayName(email: string | null | undefined, fullName?: string) {
  if (fullName?.trim()) {
    return fullName.trim();
  }

  if (!email) {
    return "Inloggad";
  }

  return email.split("@")[0];
}

function getRoleLabel(role: string | null | undefined) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "owner") {
    return "Ägare";
  }

  return "Konto";
}

function getProviderLabel(provider: string | null | undefined) {
  if (provider === "google") {
    return "Google";
  }

  if (!provider) {
    return "Okänd";
  }

  return provider;
}

function formatLastLogin(value: string | null | undefined) {
  if (!value) {
    return "Saknas";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saknas";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatUserId(value: string | null | undefined) {
  if (!value) {
    return "Saknas";
  }

  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

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

function mergeUniqueLots(previousLots: Lot[], nextLots: Lot[]) {
  const seen = new Set<number>();
  const merged: Lot[] = [];

  for (const lot of [...previousLots, ...nextLots]) {
    if (!seen.has(lot.id)) {
      seen.add(lot.id);
      merged.push(lot);
    }
  }

  return merged;
}

function buildSortOptions(hasQuery: boolean, status: SearchStatus) {
  return [
    ...(hasQuery ? [{ value: "relevance", label: "Relevans" }] : []),
    ...(status !== "ended"
      ? [{ value: "ending-soon", label: "Kortast tid kvar" }]
      : []),
    ...(status !== "active"
      ? [{ value: "recently-ended", label: "Senast klubbat" }]
      : []),
    ...(status === "ended"
      ? [{ value: "recently-sold", label: "Senast sålt" }]
      : []),
    ...(status !== "active"
      ? [{ value: "sold-price-desc", label: "Högsta slutpris" }]
      : []),
    ...(status !== "ended"
      ? [{ value: "newly-listed", label: "Senast inkommet" }]
      : []),
    { value: "price-desc", label: "Högsta bud" },
    { value: "price-asc", label: "Lägsta bud" },
    { value: "estimate-desc", label: "Högsta utrop" },
  ] as const;
}

function readStoredStringList(key: string) {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function HomePageClient({
  canAccessRecommendations = false,
}: HomePageClientProps) {
  const { data: session } = useSession();
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [pendingMobileResultsJump, setPendingMobileResultsJump] =
    useState(false);
  const [showMobileTopShortcut, setShowMobileTopShortcut] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileHeaderVisible, setMobileHeaderVisible] = useState(true);
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>("grid");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [authSheetKind, setAuthSheetKind] = useState<AuthSheetKind | null>(
    null,
  );
  const [displayLots, setDisplayLots] = useState<Lot[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const lastScrollYRef = useRef(0);
  const {
    favorites,
    toggleFavorite,
    openFavorites,
    signInToContinue,
    isFavorite,
    count: favCount,
    isAuthenticated,
    isPendingAuth,
  } = useFavorites();
  const {
    lots,
    total,
    didYouMean,
    loading,
    facets,
    stats,
    query,
    settledQuery,
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
      query: settledQuery,
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

  const selectedHouseLabel = facets.houses.find(
    (house) => house.value === selectedHouseId,
  )?.label;
  const resultDrivenSuggestions = useMemo(
    () => buildResultDrivenSuggestions(lots),
    [lots],
  );
  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    const trimmedQuery = settledQuery.trim();

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
  }, [remoteSuggestions, resultDrivenSuggestions, settledQuery, status]);
  const sortOptions = useMemo(
    () => buildSortOptions(Boolean(settledQuery.trim()), status),
    [settledQuery, status],
  );
  const cityOptions = useMemo(
    () =>
      [...facets.cities].sort((left, right) =>
        left.value.localeCompare(right.value, "sv-SE"),
      ),
    [facets.cities],
  );
  const houseOptions = useMemo(
    () =>
      [...facets.houses].sort((left, right) =>
        (left.label ?? left.value).localeCompare(
          right.label ?? right.value,
          "sv-SE",
        ),
      ),
    [facets.houses],
  );
  const mobileCategories = useMemo(
    () =>
      Array.from(
        new Set([
          ...selectedCategories,
          ...[...facets.categories]
            .sort((left, right) =>
              left.value.localeCompare(right.value, "sv-SE"),
            )
            .map((category) => category.value),
        ]),
      ),
    [facets.categories, selectedCategories],
  );
  const trendingCategories = useMemo(() => {
    const categoryValues = [
      ...selectedCategories,
      ...[...facets.categories]
        .sort(
          (left, right) =>
            right.count - left.count ||
            left.value.localeCompare(right.value, "sv-SE"),
        )
        .map((category) => category.value),
      ...CATEGORY_ORDER,
    ];

    return Array.from(new Set(categoryValues.filter(Boolean))).slice(0, 8);
  }, [facets.categories, selectedCategories]);
  const relatedCategories = useMemo(() => {
    const suggestionCategories = searchSuggestions
      .filter((suggestion) => suggestion.type === "category")
      .map((suggestion) => suggestion.query);

    return Array.from(
      new Set(
        [...suggestionCategories, ...trendingCategories].filter(
          (category) => !selectedCategories.includes(category),
        ),
      ),
    ).slice(0, 5);
  }, [searchSuggestions, selectedCategories, trendingCategories]);
  const searchRequestKey = useMemo(
    () =>
      JSON.stringify({
        showFavsOnly,
        query: settledQuery.trim(),
        status,
        categories: selectedCategories,
        auctionIds: selectedAuctionIds,
        city: selectedCity,
        houseId: selectedHouseId,
        hasBids,
        soldOnly,
        minPrice,
        maxPrice,
        sortBy,
        pageSize,
      }),
    [
      hasBids,
      maxPrice,
      minPrice,
      pageSize,
      settledQuery,
      selectedAuctionIds,
      selectedCategories,
      selectedCity,
      selectedHouseId,
      showFavsOnly,
      soldOnly,
      sortBy,
      status,
    ],
  );
  const mobileFilterTop = mobileHeaderVisible ? MOBILE_HEADER_HEIGHT : 0;
  const mobileOverlayTop = mobileFilterTop + MOBILE_FILTER_BAR_HEIGHT;
  const hasMoreResults = displayLots.length < total;
  const mobileNavItems = useMemo(() => {
    const items = [
      { href: "/", label: "Föremål" },
      { href: "/auctions", label: "Auktioner" },
    ];

    if (session?.user?.role === "admin" || session?.user?.role === "owner") {
      items.push({ href: "/admin", label: "Admin" });
      items.push({ href: "/ai-usage", label: "AI-statistik" });
    }

    return items;
  }, [session?.user?.role]);
  const mobileDisplayName = getDisplayName(
    session?.user?.email ?? null,
    typeof session?.user?.name === "string" ? session.user.name : undefined,
  );
  const mobileRoleLabel = getRoleLabel(session?.user?.role ?? null);
  const mobileAccountStatus = session?.user?.isActive ? "Aktiv" : "Inaktiv";
  const mobileProviderLabel = getProviderLabel(
    session?.user?.authProvider ?? null,
  );
  const mobileLastLoginLabel = formatLastLogin(
    session?.user?.lastLoginAt ?? null,
  );
  const mobileUserIdLabel = formatUserId(session?.user?.id ?? null);
  const mobileAvatarUrl =
    !avatarLoadFailed && typeof session?.user?.image === "string"
      ? session.user.image
      : null;

  const persistRecentSearch = useCallback((value: string) => {
    const trimmedValue = value.trim();

    if (trimmedValue.length < 2 || typeof window === "undefined") {
      return;
    }

    setRecentSearches((current) => {
      const normalizedValue = normalizeSearchText(trimmedValue);
      const nextValues = [
        trimmedValue,
        ...current.filter(
          (entry) => normalizeSearchText(entry) !== normalizedValue,
        ),
      ].slice(0, 6);

      localStorage.setItem(
        RECENT_SEARCHES_STORAGE_KEY,
        JSON.stringify(nextValues),
      );

      return nextValues;
    });
  }, []);

  const scrollToResults = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const resultsTop = document.getElementById("search-results-top");
    if (!resultsTop) {
      return;
    }

    const offset = window.innerWidth < 640 ? 112 : 16;
    const top =
      resultsTop.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  const scrollToSearchTop = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleToggleFavoritesMode = useCallback(async () => {
    if (showFavsOnly) {
      setShowFavsOnly(false);
      return;
    }

    if (!isAuthenticated) {
      setAuthSheetKind("favorites");
      return;
    }

    const canOpenFavorites = await openFavorites();

    if (canOpenFavorites) {
      setShowFavsOnly(true);
      setMobileMenuOpen(false);
    }
  }, [isAuthenticated, openFavorites, showFavsOnly]);

  const handleFavoriteToggle = useCallback(
    async (lotId: number) => {
      if (!isAuthenticated) {
        setAuthSheetKind("favorite");
        return;
      }

      await toggleFavorite(lotId);
    },
    [isAuthenticated, toggleFavorite],
  );

  const applySingleCategory = useCallback(
    (nextCategory: string | null) => {
      const categoriesToRemove = nextCategory
        ? selectedCategories.filter((category) => category !== nextCategory)
        : [...selectedCategories];

      for (const category of categoriesToRemove) {
        toggleCategory(category);
      }

      if (nextCategory && !selectedCategories.includes(nextCategory)) {
        toggleCategory(nextCategory);
      }
    },
    [selectedCategories, toggleCategory],
  );

  const submitSearchFromHero = useCallback(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery) {
      persistRecentSearch(trimmedQuery);
    }

    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setPendingMobileResultsJump(true);
      setMobileSearchOpen(false);
    }
  }, [persistRecentSearch, query]);

  const handleSuggestionSelect = useCallback(
    (suggestion: SearchSuggestion) => {
      setQuery(suggestion.query);
      persistRecentSearch(suggestion.query);

      if (typeof window !== "undefined" && window.innerWidth < 640) {
        setPendingMobileResultsJump(true);
        setMobileSearchOpen(false);
      }
    },
    [persistRecentSearch, setQuery],
  );

  const handleRecentSearchSelect = useCallback(
    (value: string) => {
      setQuery(value);
      persistRecentSearch(value);
      setPendingMobileResultsJump(true);
      setMobileSearchOpen(false);
    },
    [persistRecentSearch, setQuery],
  );

  const handleQuickCategorySelect = useCallback(
    (category: string | null) => {
      setShowFavsOnly(false);
      applySingleCategory(category);
      setMobileSearchOpen(false);
      setPendingMobileResultsJump(true);
    },
    [applySingleCategory],
  );

  const handleQuickHouseSelect = useCallback(
    (houseId: string) => {
      if (!houseId) {
        return;
      }

      setShowFavsOnly(false);
      setHouseId(houseId);
      setMobileSearchOpen(false);
      setPendingMobileResultsJump(true);
    },
    [setHouseId],
  );

  const applyDidYouMean = useCallback(() => {
    if (!didYouMean) {
      return;
    }

    setQuery(didYouMean);
    persistRecentSearch(didYouMean);
    scrollToSearchTop();
  }, [didYouMean, persistRecentSearch, scrollToSearchTop, setQuery]);

  useEffect(() => {
    setRecentSearches(readStoredStringList(RECENT_SEARCHES_STORAGE_KEY));

    if (typeof window === "undefined") {
      return;
    }

    const storedViewMode = localStorage.getItem(MOBILE_VIEW_MODE_STORAGE_KEY);
    if (storedViewMode === "list" || storedViewMode === "grid") {
      setMobileViewMode(storedViewMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(MOBILE_VIEW_MODE_STORAGE_KEY, mobileViewMode);
  }, [mobileViewMode]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [session?.user?.image]);

  useEffect(() => {
    if (!pendingMobileResultsJump || loading) {
      return;
    }

    scrollToResults();
    setPendingMobileResultsJump(false);
  }, [loading, pendingMobileResultsJump, scrollToResults]);

  useEffect(() => {
    setDisplayLots([]);
    setLoadingMore(false);
  }, [searchRequestKey]);

  useEffect(() => {
    if (loading) {
      return;
    }

    setDisplayLots((current) =>
      page <= 1 ? lots : mergeUniqueLots(current, lots),
    );
    setLoadingMore(false);
  }, [lots, loading, page]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      if (window.innerWidth >= 640) {
        setMobileSearchOpen(false);
        setMobileMenuOpen(false);
        setMobileFiltersOpen(false);
        setMobileHeaderVisible(true);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) {
      setMobileHeaderVisible(true);
      setMobileMenuOpen(false);
      setMobileFiltersOpen(false);

      requestAnimationFrame(() => {
        mobileSearchInputRef.current?.focus();
      });
    }
  }, [mobileSearchOpen]);

  useEffect(() => {
    const updateScrollUi = () => {
      if (typeof window === "undefined") {
        return;
      }

      const widthIsMobile = window.innerWidth < 640;
      const scrollY = window.scrollY;

      setShowMobileTopShortcut(widthIsMobile && scrollY > 900);

      setMobileHeaderVisible(true);

      lastScrollYRef.current = scrollY;
    };

    updateScrollUi();
    window.addEventListener("scroll", updateScrollUi, { passive: true });
    window.addEventListener("resize", updateScrollUi);

    return () => {
      window.removeEventListener("scroll", updateScrollUi);
      window.removeEventListener("resize", updateScrollUi);
    };
  }, [mobileFiltersOpen, mobileMenuOpen, mobileSearchOpen]);

  useEffect(() => {
    if (
      typeof IntersectionObserver === "undefined" ||
      !loadMoreRef.current ||
      loading ||
      loadingMore ||
      !hasMoreResults
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          !entry?.isIntersecting ||
          loading ||
          loadingMore ||
          !hasMoreResults
        ) {
          return;
        }

        setLoadingMore(true);
        setPage(page + 1);
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasMoreResults, loading, loadingMore, page, setPage]);

  return (
    <div
      className="min-h-screen bg-[linear-gradient(180deg,#f7f1eb_0%,#fbf8f6_26%,#f8f4f0_100%)]"
      data-recommendations-access={
        canAccessRecommendations ? "enabled" : "disabled"
      }
    >
      <div className="sm:hidden">
        <div className="fixed inset-x-0 top-0 z-[60] border-b border-brand-200/80 bg-[#fcfaf8] shadow-[0_10px_24px_rgba(93,69,40,0.06)]">
          <div
            className="mx-auto flex h-[50px] max-w-[1360px] items-center gap-2 px-3 transition-transform duration-200 ease-out"
            style={{
              paddingLeft: "calc(0.75rem + env(safe-area-inset-left, 0px))",
              paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
              transform: mobileHeaderVisible
                ? "translateY(0)"
                : "translateY(-100%)",
            }}
          >
            <Link
              href="/"
              className="group flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden pr-1"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500 transition-transform group-hover:scale-125" />
              <span className="truncate font-serif text-[17px] font-semibold tracking-tight text-brand-950">
                Auktio
              </span>
            </Link>

            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen((current) => !current);
                  setMobileSearchOpen(false);
                  setMobileFiltersOpen(false);
                  setMobileHeaderVisible(true);
                }}
                aria-expanded={mobileMenuOpen}
                aria-label="Öppna meny"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  mobileMenuOpen
                    ? "border-brand-900 bg-brand-900 text-white"
                    : "border-brand-200 bg-white text-brand-700"
                }`}
              >
                {mobileMenuOpen ? (
                  <X size={16} />
                ) : session?.user ? (
                  <span className="relative flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-brand-200/80">
                    {mobileAvatarUrl ? (
                      <img
                        src={mobileAvatarUrl}
                        alt={mobileDisplayName}
                        className="h-7 w-7 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarLoadFailed(true)}
                      />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900 text-white">
                        <User2 size={13} strokeWidth={2.2} />
                      </span>
                    )}
                    <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-[#fcfaf8] bg-emerald-400" />
                  </span>
                ) : (
                  <Menu size={16} />
                )}
              </button>
            </div>
          </div>
        </div>

        <div
          className="fixed inset-x-0 z-[55] border-b border-brand-200/70 bg-[#fcfaf8] px-3 py-2 transition-[top] duration-200 ease-out"
          style={{
            top: mobileFilterTop,
            paddingLeft: "calc(0.75rem + env(safe-area-inset-left, 0px))",
            paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
          }}
        >
          <div className="mx-auto flex max-w-[1360px] items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMobileSearchOpen((current) => !current);
                setMobileHeaderVisible(true);
                setMobileMenuOpen(false);
                setMobileFiltersOpen(false);
              }}
              aria-expanded={mobileSearchOpen}
              aria-label="Öppna sök"
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                mobileSearchOpen
                  ? "border-brand-900 bg-brand-900 text-white"
                  : "border-brand-200 bg-white text-brand-700"
              }`}
            >
              {mobileSearchOpen ? <X size={16} /> : <Search size={16} />}
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileFiltersOpen(true);
                setMobileHeaderVisible(true);
                setMobileMenuOpen(false);
                setMobileSearchOpen(false);
              }}
              aria-label="Visa filter"
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-brand-800"
            >
              <SlidersHorizontal size={14} />
              <span className="max-[430px]:hidden">Filter</span>
            </button>

            <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2 pr-1">
                <button
                  type="button"
                  onClick={() => handleQuickCategorySelect(null)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    selectedCategories.length === 0
                      ? "bg-brand-900 text-white"
                      : "border border-brand-200 bg-white text-brand-700"
                  }`}
                >
                  Alla kategorier
                </button>

                {mobileCategories.map((category) => {
                  const isActive = selectedCategories.includes(category);

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleQuickCategorySelect(category)}
                      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        isActive
                          ? "bg-brand-900 text-white"
                          : "border border-brand-200 bg-white text-brand-700"
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {mobileSearchOpen ? (
          <div
            className="fixed inset-x-0 z-[58] border-b border-brand-200 bg-white px-3 pb-3 pt-2"
            style={{ top: mobileOverlayTop }}
          >
            <div className="mx-auto max-w-[1360px] rounded-2xl border border-brand-200 bg-white p-3 shadow-[0_16px_36px_rgba(26,26,24,0.08)]">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-400"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitSearchFromHero();
                    }
                  }}
                  placeholder="AI-sök på objekt, stil eller material"
                  className="h-11 w-full rounded-xl border border-brand-200 bg-white pl-10 pr-11 text-[14px] text-brand-950 outline-none transition-colors focus:border-brand-900"
                />
                {query.trim() ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Rensa sökning"
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-brand-400"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>

              {query.trim() ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-brand-400">
                    <span className="font-semibold uppercase tracking-[0.14em]">
                      AI-förslag
                    </span>
                    <span>
                      {suggestionsLoading
                        ? "Uppdaterar..."
                        : "Semantiska träffar"}
                    </span>
                  </div>

                  {searchSuggestions.length > 0 ? (
                    <div className="space-y-1">
                      {searchSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          onClick={() => handleSuggestionSelect(suggestion)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-brand-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-brand-950">
                              {suggestion.label}
                            </p>
                            {suggestion.subtitle ? (
                              <p className="truncate text-[11px] text-brand-500">
                                {suggestion.subtitle}
                              </p>
                            ) : null}
                          </div>
                          <ChevronRight
                            size={15}
                            className="shrink-0 text-brand-300"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-brand-50 px-3 py-3 text-[12px] text-brand-500">
                      AI-sökningen letar efter relaterade material, stilar och
                      kategorier medan du skriver.
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {recentSearches.length > 0 ? (
                    <div>
                      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
                        <Clock3 size={12} />
                        Senaste sökningar
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recentSearches.map((recentSearch) => (
                          <button
                            key={recentSearch}
                            type="button"
                            onClick={() =>
                              handleRecentSearchSelect(recentSearch)
                            }
                            className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-[12px] font-medium text-brand-700"
                          >
                            {recentSearch}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
                      <TrendingUp size={12} />
                      Populära kategorier
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {mobileCategories.slice(0, 10).map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => handleQuickCategorySelect(category)}
                          className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-[12px] font-medium text-brand-700"
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[65]">
            <button
              type="button"
              aria-label="Stäng meny"
              className="absolute inset-0 bg-brand-950/35"
              onClick={() => setMobileMenuOpen(false)}
            />

            <div className="absolute right-0 top-0 h-full w-[min(84vw,320px)] border-l border-brand-200 bg-white px-4 pb-6 pt-16 shadow-2xl">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Stäng meny"
                className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-500 transition-colors hover:border-brand-300 hover:text-brand-900"
              >
                <X size={18} />
              </button>

              {isAuthenticated ? (
                <div className="mb-5 rounded-2xl border border-brand-200 bg-brand-50 p-3">
                  <div className="rounded-xl border border-brand-200 bg-white px-3 py-3 shadow-card">
                    <div className="flex items-center gap-3">
                      {mobileAvatarUrl ? (
                        <img
                          src={mobileAvatarUrl}
                          alt={mobileDisplayName}
                          className="h-11 w-11 shrink-0 rounded-full border border-brand-200 object-cover"
                          referrerPolicy="no-referrer"
                          onError={() => setAvatarLoadFailed(true)}
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-900 text-white">
                          <User2 size={17} strokeWidth={2.2} />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-brand-900">
                          {mobileDisplayName}
                        </div>
                        {session?.user?.email ? (
                          <div className="truncate text-[11px] text-brand-500">
                            {session.user.email}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-100 px-2.5 py-2 text-[11px] text-brand-600">
                      <span>Konto</span>
                      <span className="rounded-full bg-brand-300/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-800">
                        {mobileRoleLabel}
                      </span>
                    </div>

                    <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
                        Användardetaljer
                      </div>
                      <dl className="mt-2 space-y-2 text-[11px] text-brand-700">
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-brand-500">Status</dt>
                          <dd className="text-right font-medium text-brand-900">
                            {mobileAccountStatus}
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-brand-500">Inloggad med</dt>
                          <dd className="text-right font-medium text-brand-900">
                            {mobileProviderLabel}
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-brand-500">Senaste inloggning</dt>
                          <dd className="text-right font-medium text-brand-900">
                            {mobileLastLoginLabel}
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-brand-500">Användar-ID</dt>
                          <dd className="text-right font-medium text-brand-900">
                            {mobileUserIdLabel}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                {mobileNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between rounded-xl border border-brand-200/80 px-3 py-3 text-sm font-medium text-brand-900"
                  >
                    <span>{item.label}</span>
                    <ChevronRight size={15} className="text-brand-300" />
                  </Link>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50 p-3">
                <button
                  type="button"
                  onClick={() => void handleToggleFavoritesMode()}
                  className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-3 text-left text-sm font-medium text-brand-900"
                >
                  <span className="inline-flex items-center gap-2">
                    <Heart size={15} className="text-accent-500" />
                    Bevakade objekt
                  </span>
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-600">
                    {favCount}
                  </span>
                </button>
              </div>

              <div className="mt-5 space-y-2">
                {isAuthenticated ? (
                  <>
                    <div className="rounded-2xl border border-brand-200 bg-white px-3 py-3 text-sm text-brand-700">
                      Inloggad som{" "}
                      {session?.user?.name ?? session?.user?.email ?? "konto"}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void signOut({ callbackUrl: window.location.href });
                      }}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-3 text-sm font-semibold text-brand-900"
                    >
                      <LogOut size={15} />
                      Logga ut
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void signInToContinue()}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-900 px-4 py-3 text-sm font-semibold text-white"
                    >
                      <LogIn size={15} />
                      Logga in
                    </button>
                    <button
                      type="button"
                      onClick={() => void signInToContinue()}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-brand-200 bg-white px-4 py-3 text-sm font-semibold text-brand-900"
                    >
                      Registrera dig
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {mobileFiltersOpen ? (
          <div className="fixed inset-0 z-[66]">
            <button
              type="button"
              aria-label="Stäng filter"
              className="absolute inset-0 bg-brand-950/35"
              onClick={() => setMobileFiltersOpen(false)}
            />

            <div className="absolute inset-x-0 bottom-0 rounded-t-[22px] border border-brand-200 bg-white px-4 pb-6 pt-4 shadow-[0_-20px_48px_rgba(26,26,24,0.16)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
                    Filter
                  </p>
                  <h2 className="text-base font-semibold text-brand-950">
                    Finjustera resultatet
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  aria-label="Stäng filter"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-500"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
                    Visning
                  </p>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-brand-50 p-1">
                    <button
                      type="button"
                      onClick={() => setMobileViewMode("grid")}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium ${
                        mobileViewMode === "grid"
                          ? "bg-brand-900 text-white"
                          : "text-brand-600"
                      }`}
                    >
                      <LayoutGrid size={15} />
                      <span>Rutnät</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileViewMode("list")}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium ${
                        mobileViewMode === "list"
                          ? "bg-brand-900 text-white"
                          : "text-brand-600"
                      }`}
                    >
                      <Rows3 size={15} />
                      <span>Lista</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-brand-50 p-1">
                  {(
                    [
                      { value: "active", label: "Aktiva" },
                      { value: "ended", label: "Avslutade" },
                      { value: "all", label: "Alla" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStatus(option.value)}
                      className={`rounded-xl px-3 py-2 text-[12px] font-medium ${
                        status === option.value
                          ? "bg-brand-900 text-white"
                          : "text-brand-600"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <select
                    value={sortBy}
                    onChange={(event) =>
                      setSortBy(event.target.value as SortOption)
                    }
                    className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm text-brand-800 outline-none"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedHouseId}
                    onChange={(event) => setHouseId(event.target.value)}
                    className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm text-brand-800 outline-none"
                  >
                    <option value="">Alla auktionshus</option>
                    {houseOptions.map((house) => (
                      <option key={house.value} value={house.value}>
                        {house.label ?? house.value} ({house.count})
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedCity}
                    onChange={(event) => setCity(event.target.value)}
                    className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm text-brand-800 outline-none"
                  >
                    <option value="">Alla orter</option>
                    {cityOptions.map((city) => (
                      <option key={city.value} value={city.value}>
                        {city.value} ({city.count})
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={minPrice ?? ""}
                      onChange={(event) =>
                        setMinPrice(
                          event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        )
                      }
                      placeholder="Minpris"
                      className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm text-brand-800 outline-none"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={maxPrice ?? ""}
                      onChange={(event) =>
                        setMaxPrice(
                          event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        )
                      }
                      placeholder="Maxpris"
                      className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm text-brand-800 outline-none"
                    />
                  </div>

                  <select
                    value={pageSize}
                    onChange={(event) =>
                      setPageSize(Number(event.target.value))
                    }
                    className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-sm text-brand-800 outline-none"
                  >
                    {[48, 72, 96].map((option) => (
                      <option key={option} value={option}>
                        {option} objekt per laddning
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setHasBids(!hasBids)}
                    className={`rounded-full px-3 py-2 text-[12px] font-medium ${
                      hasBids
                        ? "bg-brand-900 text-white"
                        : "border border-brand-200 bg-white text-brand-700"
                    }`}
                  >
                    Har bud
                  </button>
                  <button
                    type="button"
                    onClick={() => setSoldOnly(!soldOnly)}
                    className={`rounded-full px-3 py-2 text-[12px] font-medium ${
                      soldOnly
                        ? "bg-brand-900 text-white"
                        : "border border-brand-200 bg-white text-brand-700"
                    }`}
                  >
                    Sålt
                  </button>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      clearFilters();
                      setMobileFiltersOpen(false);
                    }}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-brand-200 bg-white px-4 py-3 text-sm font-semibold text-brand-900"
                  >
                    Rensa
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-brand-900 px-4 py-3 text-sm font-semibold text-white"
                  >
                    Visa resultat
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="hidden sm:block">
        <Header
          favoritesCount={favCount}
          showFavsOnly={showFavsOnly}
          onToggleFavs={() => {
            void handleToggleFavoritesMode();
          }}
        />
      </div>

      <div className="hidden sm:block">
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
          onMobileSearchActivate={scrollToSearchTop}
        />
      </div>

      <main
        id="search-results-top"
        className="relative mx-auto max-w-[1360px] px-3 pb-20 pt-[112px] sm:px-6 sm:pt-0"
      >
        <div className="pointer-events-none absolute inset-x-0 top-[84px] -z-10 h-40 sm:hidden">
          <div className="absolute left-[-14%] top-0 h-28 w-28 rounded-full bg-accent-100/80 blur-3xl" />
          <div className="absolute right-[-8%] top-6 h-32 w-32 rounded-full bg-gold-100/70 blur-3xl" />
        </div>

        <StatsBar
          lots={displayLots}
          total={total}
          status={showFavsOnly ? "all" : status}
          windowCount={stats.windowCount}
          totalValue={stats.totalValue}
          totalValueCurrency={stats.totalValueCurrency}
          totalValueHasMixedCurrencies={stats.totalValueHasMixedCurrencies}
        />

        {showFavsOnly ? (
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
        ) : null}

        {!showFavsOnly && selectedAuctionIds.length > 0 ? (
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
              : `${selectedAuctionIds.length} vald${
                  selectedAuctionIds.length === 1 ? " auktion" : "a auktioner"
                }`}
            {selectedAuctionTitles.length > 2 ? (
              <span className="font-semibold text-sky-950">
                {` och ${selectedAuctionTitles.length - 2} till`}
              </span>
            ) : null}
            .
            <button
              type="button"
              onClick={clearFilters}
              className="ml-2 font-semibold text-sky-900 underline underline-offset-2"
            >
              Rensa filtret
            </button>
          </div>
        ) : null}

        <div id="search-results-controls" className="hidden sm:block">
          {showFavsOnly ? null : (
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
            />
          )}
        </div>

        {!showFavsOnly && !loading && displayLots.length === 0 && didYouMean ? (
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
        ) : null}

        {showFavsOnly && !loading && displayLots.length === 0 ? (
          <div className="rounded-3xl border border-brand-200 bg-white px-6 py-10 text-center shadow-card sm:px-8">
            <div className="mx-auto max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
                Bevakade
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-brand-900">
                Du har inga bevakade föremål än
              </h3>
              <p className="mt-3 text-sm leading-6 text-brand-600">
                När du markerar ett föremål med hjärtat sparas det på ditt konto
                och dyker upp här.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowFavsOnly(false)}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-950"
                >
                  Utforska föremål
                </button>
                <button
                  type="button"
                  onClick={scrollToSearchTop}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-800 transition hover:border-brand-300 hover:bg-brand-50"
                >
                  Till toppen
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <LotGrid
              lots={displayLots}
              loading={loading}
              loadingMore={loadingMore}
              status={showFavsOnly ? "all" : status}
              isFavorite={isFavorite}
              onToggleFavorite={handleFavoriteToggle}
              viewMode={mobileViewMode}
              relatedCategories={relatedCategories}
              onCategorySelect={handleQuickCategorySelect}
              onHouseSelect={handleQuickHouseSelect}
              onRelatedCategorySelect={(category) =>
                handleQuickCategorySelect(category)
              }
            />

            <div ref={loadMoreRef} className="h-4" aria-hidden="true" />
          </>
        )}
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
          aria-label="Till toppen"
        >
          <ArrowUp size={15} />
          <span>Till toppen</span>
        </button>
      </div>

      <BrowseAuthSheet
        open={authSheetKind != null}
        title={
          authSheetKind === "favorite"
            ? "Logga in för att bevaka detta objekt"
            : "Logga in för att se dina bevakningar"
        }
        description={
          authSheetKind === "favorite"
            ? "När du är inloggad kan du spara objekt och komma tillbaka till dem senare. Har du inget konto skapas det första gången du fortsätter."
            : "Dina bevakade objekt sparas på kontot och följer med mellan enheter. Har du inget konto skapas det första gången du fortsätter."
        }
        confirmLabel="Logga in"
        secondaryLabel="Registrera dig"
        confirmBusy={isPendingAuth}
        onClose={() => setAuthSheetKind(null)}
        onConfirm={() => void signInToContinue()}
        onSecondaryAction={() => void signInToContinue()}
      />
    </div>
  );
}
