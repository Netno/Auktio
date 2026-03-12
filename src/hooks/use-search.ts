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

interface UseSearchReturn {
  // State
  lots: Lot[];
  total: number;
  loading: boolean;
  error: string | null;
  facets: {
    categories: FacetCount[];
    cities: FacetCount[];
    houses: FacetCount[];
  };
  stats: {
    windowCount: number;
  };

  // Params
  query: string;
  selectedCategories: string[];
  selectedCity: string;
  selectedHouseId: string;
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
  setMinPrice: (v: number | undefined) => void;
  setMaxPrice: (v: number | undefined) => void;
  setSortBy: (sort: SortOption) => void;
  setPage: (page: number) => void;
  clearFilters: () => void;
}

const QUERY_DEBOUNCE_MS = 500;
const DEFAULT_STATUS: SearchStatus = "active";

function getDefaultSortForStatus(status: SearchStatus): SortOption {
  return status === "ended" ? "recently-ended" : "ending-soon";
}

export function useSearch(): UseSearchReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial state from URL
  const [query, setQueryState] = useState(searchParams.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(
    searchParams.get("q") ?? "",
  );
  const [selectedCategories, setCategories] = useState<string[]>(
    searchParams.get("categories")?.split(",").filter(Boolean) ?? [],
  );
  const [selectedCity, setCityState] = useState(searchParams.get("city") ?? "");
  const [selectedHouseId, setHouseIdState] = useState(
    searchParams.get("houseId") ?? "",
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
  const [searchMode, setSearchModeState] = useState<SearchMode>(
    (searchParams.get("mode") as SearchMode) ?? "keyword",
  );
  const [status, setStatusState] = useState<SearchStatus>(() => {
    const statusParam = searchParams.get("status") as SearchStatus | null;
    if (
      statusParam === "active" ||
      statusParam === "ended" ||
      statusParam === "all"
    ) {
      return statusParam;
    }
    return searchParams.get("activeOnly") === "false" ? "all" : DEFAULT_STATUS;
  });
  const [sortBy, setSortByState] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) ??
      getDefaultSortForStatus(
        ((searchParams.get("status") as SearchStatus | null) ??
          (searchParams.get("activeOnly") === "false"
            ? "all"
            : DEFAULT_STATUS)) as SearchStatus,
      ),
  );
  const [page, setPageState] = useState(Number(searchParams.get("page")) || 1);
  const pageSize = 40;

  // Results
  const [lots, setLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<{
    categories: FacetCount[];
    cities: FacetCount[];
    houses: FacetCount[];
  }>({ categories: [], cities: [], houses: [] });
  const [stats, setStats] = useState({ windowCount: 0 });

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
      categories: string[];
      city: string;
      houseId: string;
      minPrice: number | undefined;
      maxPrice: number | undefined;
      sortBy: SortOption;
      page: number;
    }) => {
      setLoading(true);
      setError(null);

      const urlParams = new URLSearchParams();
      if (params.query) urlParams.set("q", params.query);
      if (params.searchMode !== "keyword")
        urlParams.set("mode", params.searchMode);
      if (params.status !== DEFAULT_STATUS)
        urlParams.set("status", params.status);
      if (params.categories.length)
        urlParams.set("categories", params.categories.join(","));
      if (params.city) urlParams.set("city", params.city);
      if (params.houseId) urlParams.set("houseId", params.houseId);
      if (params.minPrice != null)
        urlParams.set("minPrice", String(params.minPrice));
      if (params.maxPrice != null)
        urlParams.set("maxPrice", String(params.maxPrice));
      if (params.sortBy !== getDefaultSortForStatus(params.status)) {
        urlParams.set("sort", params.sortBy);
      }
      if (params.page > 1) urlParams.set("page", String(params.page));
      urlParams.set("pageSize", String(pageSize));

      try {
        const res = await fetch(`/api/search?${urlParams.toString()}`);
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);

        const data: SearchResponse = await res.json();
        setLots(data.lots);
        setTotal(data.total);
        setFacets(data.facets);
        setStats(data.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setLots([]);
        setStats({ windowCount: 0 });
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
      categories: selectedCategories,
      city: selectedCity,
      houseId: selectedHouseId,
      minPrice,
      maxPrice,
      sortBy,
      page,
    });
  }, [
    debouncedQuery,
    searchMode,
    status,
    selectedCategories,
    selectedCity,
    selectedHouseId,
    minPrice,
    maxPrice,
    sortBy,
    page,
    fetchResults,
  ]);

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

  const setMaxPrice = (v: number | undefined) => {
    setMaxPriceState(v);
    setPageState(1);
  };

  const setSearchMode = (mode: SearchMode) => {
    setSearchModeState(mode);
    setPageState(1);
  };

  const setStatus = (nextStatus: SearchStatus) => {
    setLoading(true);
    setError(null);
    setStatusState(nextStatus);
    setSortByState((currentSort) => {
      if (nextStatus === "ended" && currentSort === "ending-soon") {
        return "recently-ended";
      }
      if (nextStatus !== "ended" && currentSort === "recently-ended") {
        return "ending-soon";
      }
      return currentSort;
    });
    setPageState(1);
  };

  const setSortBy = (sort: SortOption) => {
    setSortByState(sort);
    setPageState(1);
  };

  const setPage = (p: number) => setPageState(p);

  const clearFilters = () => {
    setQueryState("");
    setCategories([]);
    setCityState("");
    setHouseIdState("");
    setMinPriceState(undefined);
    setMaxPriceState(undefined);
    setStatusState(DEFAULT_STATUS);
    setSortByState(getDefaultSortForStatus(DEFAULT_STATUS));
    setPageState(1);
  };

  return {
    lots,
    total,
    loading,
    error,
    facets,
    stats,
    query,
    searchMode,
    status,
    selectedCategories,
    selectedCity,
    selectedHouseId,
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
    setMinPrice,
    setMaxPrice,
    setSortBy,
    setPage,
    clearFilters,
  };
}
