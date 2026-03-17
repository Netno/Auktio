"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  SearchStatus,
  SearchSuggestion,
  SearchSuggestionsResponse,
} from "@/lib/types";

const SUGGESTION_DEBOUNCE_MS = 160;

interface UseSearchSuggestionsOptions {
  query: string;
  status: SearchStatus;
  selectedCategories: string[];
  selectedCity: string;
  selectedHouseId: string;
}

export function useSearchSuggestions({
  query,
  status,
  selectedCategories,
  selectedCity,
  selectedHouseId,
}: UseSearchSuggestionsOptions) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const requestKey = useMemo(
    () =>
      JSON.stringify({
        query: query.trim(),
        status,
        categories: selectedCategories,
        city: selectedCity,
        houseId: selectedHouseId,
      }),
    [query, selectedCategories, selectedCity, selectedHouseId, status],
  );

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setLoading(true);

      try {
        const params = new URLSearchParams({
          q: trimmedQuery,
          status,
        });

        if (selectedCategories.length > 0) {
          params.set("categories", selectedCategories.join(","));
        }

        if (selectedCity) {
          params.set("city", selectedCity);
        }

        if (selectedHouseId) {
          params.set("houseId", selectedHouseId);
        }

        const response = await fetch(
          `/api/search/suggestions?${params.toString()}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Suggestion request failed: ${response.status}`);
        }

        const data = (await response.json()) as SearchSuggestionsResponse;
        setSuggestions(data.suggestions);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, SUGGESTION_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [
    requestKey,
    query,
    selectedCategories,
    selectedCity,
    selectedHouseId,
    status,
  ]);

  return { suggestions, loading };
}
