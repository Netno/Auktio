"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  Lot,
  SearchResponse,
  SortOption,
  SearchMode,
  SearchStatus,
  FacetCount,
} from "@/lib/types";

interface UseSearchOptions {
  lotIds?: number[];
}

interface UseSearchReturn {
  // State
  lots: Lot[];
  total: number;
  didYouMean: string | null;
  loading: boolean;
  error: string | null;
  facets: {
    categories: FacetCount[];
    cities: FacetCount[];
    houses: FacetCount[];
  };
  stats: {
    windowCount: number;
    totalValue: number;
    totalValueCurrency: string | null;
    totalValueHasMixedCurrencies: boolean;
  };

  // Params
  query: string;
  selectedCategories: string[];
  selectedAuctionIds: number[];
  selectedAuctionTitles: string[];
  selectedCity: string;
  selectedHouseId: string;
  hasBids: boolean;
  soldOnly: boolean;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  searchMode: SearchMode;
  status: SearchStatus;
  sortBy: SortOption;
  page: number;
  pageSize: number;

  // Actions
  setQuery: (q: string) => void;
  setSearchMode: (mode: SearchMode) => void;
  setStatus: (status: SearchStatus) => void;
  toggleCategory: (cat: string) => void;
  setCity: (city: string) => void;
  setHouseId: (id: string) => void;
  setHasBids: (value: boolean) => void;
  setSoldOnly: (value: boolean) => void;
  setMinPrice: (v: number | undefined) => void;
  setMaxPrice: (v: number | undefined) => void;
  setSortBy: (sort: SortOption) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  clearFilters: () => void;
}

const QUERY_DEBOUNCE_MS = 500;
const DEFAULT_STATUS: SearchStatus = "active";
const DEFAULT_SEARCH_MODE: SearchMode = "hybrid";
const DEFAULT_PAGE_SIZE = 48;

function getInitialStatus(searchParams: ReturnType<typeof useSearchParams>) {
  const statusParam = searchParams.get("status") as SearchStatus | null;

  if (
    statusParam === "active" ||
    statusParam === "ended" ||
    statusParam === "all"
  ) {
    return statusParam;
  }

  if (searchParams.get("activeOnly") === "false") {
    return "all";
  }

  if (searchParams.get("auctionId")) {
    return "all";
  }

  return DEFAULT_STATUS;
}

function getDefaultSortForStatus(status: SearchStatus): SortOption {
  return status === "ended" ? "recently-ended" : "ending-soon";
}

function getDefaultSort(status: SearchStatus, query: string): SortOption {
  return query.trim() ? "relevance" : getDefaultSortForStatus(status);
}

export function useSearch(options?: UseSearchOptions): UseSearchReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lotIdsKey =
    options?.lotIds == null ? "__all__" : options.lotIds.join(",");

  // Read initial state from URL
  const [query, setQueryState] = useState(searchParams.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(
    searchParams.get("q") ?? "",
  );
  const [selectedCategories, setCategories] = useState<string[]>(
    searchParams.get("categories")?.split(",").filter(Boolean) ?? [],
  );
  const [selectedAuctionIds, setSelectedAuctionIds] = useState<number[]>(
    searchParams
      .get("auctionId")
      ?.split(",")
      .filter((value) => value.trim().length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)) ?? [],
  );
  const [selectedAuctionTitles, setSelectedAuctionTitles] = useState<string[]>(
    searchParams
      .getAll("auctionTitle")
      .filter((value) => value.trim().length > 0),
  );
  const [selectedCity, setCityState] = useState(searchParams.get("city") ?? "");
  const [selectedHouseId, setHouseIdState] = useState(
    searchParams.get("houseId") ?? "",
  );
  const [hasBids, setHasBidsState] = useState(
    searchParams.get("hasBids") === "true",
  );
  const [soldOnly, setSoldOnlyState] = useState(
    searchParams.get("soldOnly") === "true",
  );
  const [minPrice, setMinPriceState] = useState<number | undefined>(
    searchParams.get("minPrice")
      ? Number(searchParams.get("minPrice"))
      : undefined,
  );
  const [maxPrice, setMaxPriceState] = useState<number | undefined>(
    searchParams.get("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : undefined,
  );
  const [searchMode, setSearchModeState] =
    useState<SearchMode>(DEFAULT_SEARCH_MODE);
  const [status, setStatusState] = useState<SearchStatus>(() =>
    getInitialStatus(searchParams),
  );
  const [sortBy, setSortByState] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) ??
      getDefaultSort(
        getInitialStatus(searchParams),
        searchParams.get("q") ?? "",
      ),
  );
  const [sortIsManual, setSortIsManual] = useState(
    Boolean(searchParams.get("sort")),
  );
  const [page, setPageState] = useState(Number(searchParams.get("page")) || 1);
  const [pageSize, setPageSizeState] = useState(() => {
    const rawValue = Number(searchParams.get("pageSize"));
    return Number.isFinite(rawValue) && rawValue > 0
      ? rawValue
      : DEFAULT_PAGE_SIZE;
  });

  // Results
  const [lots, setLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [didYouMean, setDidYouMean] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<{
    categories: FacetCount[];
    cities: FacetCount[];
    houses: FacetCount[];
  }>({ categories: [], cities: [], houses: [] });
  const [stats, setStats] = useState({
    windowCount: 0,
    totalValue: 0,
    totalValueCurrency: null as string | null,
    totalValueHasMixedCurrencies: false,
  });

  // Debounce timer
  const queryDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce only the typed search query to avoid jumpy updates while typing.
  useEffect(() => {
    if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);

    queryDebounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, QUERY_DEBOUNCE_MS);

    return () => {
      if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
    };
  }, [query]);

  // Build URL params and fetch
  const fetchResults = useCallback(
    async (params: {
      query: string;
      searchMode: SearchMode;
      status: SearchStatus;
      lotIds?: number[];
      categories: string[];
      auctionIds: number[];
      auctionTitles: string[];
      city: string;
      houseId: string;
      hasBids: boolean;
      soldOnly: boolean;
      minPrice: number | undefined;
      maxPrice: number | undefined;
      sortBy: SortOption;
      page: number;
      pageSize: number;
    }) => {
      setLoading(true);
      setError(null);

      const urlParams = new URLSearchParams();
      const requestParams = new URLSearchParams();
      if (params.query) urlParams.set("q", params.query);
      if (params.query) requestParams.set("q", params.query);
      if (params.status !== DEFAULT_STATUS)
        urlParams.set("status", params.status);
      if (params.status !== DEFAULT_STATUS)
        requestParams.set("status", params.status);
      if (params.lotIds) {
        requestParams.set("ids", params.lotIds.join(","));
      }
      if (params.categories.length)
        urlParams.set("categories", params.categories.join(","));
      if (params.categories.length)
        requestParams.set("categories", params.categories.join(","));
      if (params.auctionIds.length)
        urlParams.set("auctionId", params.auctionIds.join(","));
      if (params.auctionIds.length)
        requestParams.set("auctionId", params.auctionIds.join(","));
      for (const title of params.auctionTitles) {
        urlParams.append("auctionTitle", title);
      }
      if (params.city) urlParams.set("city", params.city);
      if (params.city) requestParams.set("city", params.city);
      if (params.houseId) urlParams.set("houseId", params.houseId);
      if (params.houseId) requestParams.set("houseId", params.houseId);
      if (params.hasBids) urlParams.set("hasBids", "true");
      if (params.hasBids) requestParams.set("hasBids", "true");
      if (params.soldOnly) urlParams.set("soldOnly", "true");
      if (params.soldOnly) requestParams.set("soldOnly", "true");
      if (params.minPrice != null)
        urlParams.set("minPrice", String(params.minPrice));
      if (params.minPrice != null)
        requestParams.set("minPrice", String(params.minPrice));
      if (params.maxPrice != null)
        urlParams.set("maxPrice", String(params.maxPrice));
      if (params.maxPrice != null)
        requestParams.set("maxPrice", String(params.maxPrice));
      if (params.sortBy !== getDefaultSort(params.status, params.query)) {
        urlParams.set("sort", params.sortBy);
        requestParams.set("sort", params.sortBy);
      }
      if (params.page > 1) urlParams.set("page", String(params.page));
      if (params.page > 1) requestParams.set("page", String(params.page));
      urlParams.set("pageSize", String(params.pageSize));
      requestParams.set("pageSize", String(params.pageSize));

      try {
        const res = await fetch(`/api/search?${requestParams.toString()}`);
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);

        const data: SearchResponse = await res.json();
        setLots(data.lots);
        setTotal(data.total);
        setDidYouMean(data.didYouMean ?? null);
        setFacets(data.facets);
        setStats(data.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setLots([]);
        setDidYouMean(null);
        setStats({
          windowCount: 0,
          totalValue: 0,
          totalValueCurrency: null,
          totalValueHasMixedCurrencies: false,
        });
      } finally {
        setLoading(false);
      }

      // Sync URL (without triggering navigation)
      const newUrl = urlParams.toString()
        ? `?${urlParams.toString()}`
        : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    },
    [router],
  );

  // Trigger search on param changes
  useEffect(() => {
    fetchResults({
      query: debouncedQuery,
      searchMode,
      status,
      lotIds: options?.lotIds,
      categories: selectedCategories,
      auctionIds: selectedAuctionIds,
      auctionTitles: selectedAuctionTitles,
      city: selectedCity,
      houseId: selectedHouseId,
      hasBids,
      soldOnly,
      minPrice,
      maxPrice,
      sortBy,
      page,
      pageSize,
    });
  }, [
    debouncedQuery,
    searchMode,
    status,
    selectedCategories,
    selectedAuctionIds,
    selectedAuctionTitles,
    selectedCity,
    selectedHouseId,
    hasBids,
    soldOnly,
    minPrice,
    maxPrice,
    sortBy,
    page,
    pageSize,
    fetchResults,
    lotIdsKey,
  ]);

  useEffect(() => {
    if (sortIsManual) return;
    setSortByState(getDefaultSort(status, debouncedQuery));
  }, [debouncedQuery, status, sortIsManual]);

  // Actions
  const setQuery = (q: string) => {
    setQueryState(q);
    setPageState(1);
  };

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
    setPageState(1);
  };

  const setCity = (city: string) => {
    setCityState(city);
    setPageState(1);
  };

  const setHouseId = (id: string) => {
    setHouseIdState(id);
    setPageState(1);
  };

  const setMinPrice = (v: number | undefined) => {
    setMinPriceState(v);
    setPageState(1);
  };

  const setHasBids = (value: boolean) => {
    setHasBidsState(value);
    setPageState(1);
  };

  const setSoldOnly = (value: boolean) => {
    setSoldOnlyState(value);
    setPageState(1);
  };

  const setMaxPrice = (v: number | undefined) => {
    setMaxPriceState(v);
    setPageState(1);
  };

  const setSearchMode = (mode: SearchMode) => {
    setSearchModeState(DEFAULT_SEARCH_MODE);
    setPageState(1);
  };

  const setStatus = (nextStatus: SearchStatus) => {
    setLoading(true);
    setError(null);
    setStatusState(nextStatus);
    if (nextStatus === "active") {
      setSoldOnlyState(false);
    }
    setSortByState((currentSort) => {
      if (!sortIsManual) {
        return getDefaultSort(nextStatus, debouncedQuery);
      }
      if (nextStatus === "ended" && currentSort === "ending-soon") {
        return "recently-ended";
      }
      if (
        nextStatus === "active" &&
        (currentSort === "recently-ended" ||
          currentSort === "recently-sold" ||
          currentSort === "sold-price-desc")
      ) {
        return "ending-soon";
      }
      return currentSort;
    });
    setPageState(1);
  };

  const setSortBy = (sort: SortOption) => {
    setSortIsManual(true);
    setSortByState(sort);
    setPageState(1);
  };

  const setPage = (p: number) => setPageState(p);

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPageState(1);
  };

  const clearFilters = () => {
    setQueryState("");
    setCategories([]);
    setSelectedAuctionIds([]);
    setSelectedAuctionTitles([]);
    setCityState("");
    setHouseIdState("");
    setHasBidsState(false);
    setSoldOnlyState(false);
    setMinPriceState(undefined);
    setMaxPriceState(undefined);
    setStatusState(DEFAULT_STATUS);
    setSortIsManual(false);
    setSortByState(getDefaultSort(DEFAULT_STATUS, ""));
    setPageSizeState(DEFAULT_PAGE_SIZE);
    setPageState(1);
  };

  return {
    lots,
    total,
    didYouMean,
    loading,
    error,
    facets,
    stats,
    query,
    searchMode,
    status,
    selectedCategories,
    selectedAuctionIds,
    selectedAuctionTitles,
    selectedCity,
    selectedHouseId,
    hasBids,
    soldOnly,
    minPrice,
    maxPrice,
    sortBy,
    page,
    pageSize,
    setQuery,
    setSearchMode,
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
  };
}
