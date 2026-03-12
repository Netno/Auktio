"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "auktio_favorites";

/**
 * Manage user favorites (watchlist).
 * Persists to localStorage initially; can later sync to Supabase.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const ids: number[] = JSON.parse(stored);
        setFavorites(new Set(ids));
      }
    } catch {
      // ignore parse errors
    }
    setLoaded(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  }, [favorites, loaded]);

  const toggleFavorite = useCallback((lotId: number) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) {
        next.delete(lotId);
      } else {
        next.add(lotId);
      }
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (lotId: number) => favorites.has(lotId),
    [favorites]
  );

  return {
    favorites,
    count: favorites.size,
    toggleFavorite,
    isFavorite,
    loaded,
  };
}
