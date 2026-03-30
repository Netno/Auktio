"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

const STORAGE_KEY = "auktio_favorites";

export function useFavorites() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const nextPath = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;

  const signInToContinue = useCallback(async () => {
    setSubmitting(true);

    try {
      await signIn("google", { callbackUrl: nextPath });
    } finally {
      setSubmitting(false);
    }
  }, [nextPath]);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (status !== "authenticated") {
      setFavorites(new Set());
      setLoaded(true);
      return;
    }

    let cancelled = false;

    async function loadFavorites() {
      try {
        const response = await fetch("/api/favorites", { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Favorites failed: ${response.status}`);
        }

        const payload = (await response.json()) as { lotIds?: number[] };
        let mergedLotIds = Array.isArray(payload.lotIds) ? payload.lotIds : [];

        try {
          const stored = localStorage.getItem(STORAGE_KEY);

          if (stored) {
            const localLotIds = JSON.parse(stored) as number[];
            const validLocalLotIds = localLotIds.filter(
              (lotId) => Number.isInteger(lotId) && lotId > 0,
            );

            if (validLocalLotIds.length > 0) {
              const importResponse = await fetch("/api/favorites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lotIds: validLocalLotIds }),
              });

              if (importResponse.ok) {
                const importPayload = (await importResponse.json()) as {
                  lotIds?: number[];
                };
                mergedLotIds = Array.isArray(importPayload.lotIds)
                  ? importPayload.lotIds
                  : mergedLotIds;
              }
            }

            localStorage.removeItem(STORAGE_KEY);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }

        if (!cancelled) {
          setFavorites(new Set(mergedLotIds));
        }
      } catch {
        if (!cancelled) {
          setFavorites(new Set());
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }

    loadFavorites();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const toggleFavorite = useCallback(
    async (lotId: number) => {
      if (status !== "authenticated") {
        return false;
      }

      const isRemoving = favorites.has(lotId);
      const previousFavorites = new Set(favorites);
      const optimisticFavorites = new Set(favorites);

      if (isRemoving) {
        optimisticFavorites.delete(lotId);
      } else {
        optimisticFavorites.add(lotId);
      }

      setFavorites(optimisticFavorites);

      try {
        const response = await fetch(
          isRemoving ? `/api/favorites?lotId=${lotId}` : "/api/favorites",
          isRemoving
            ? { method: "DELETE" }
            : {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lotId }),
              },
        );

        if (!response.ok) {
          throw new Error(`Favorites failed: ${response.status}`);
        }

        const payload = (await response.json()) as { lotIds?: number[] };
        setFavorites(new Set(payload.lotIds ?? []));
        return true;
      } catch {
        setFavorites(previousFavorites);
        return false;
      }
    },
    [favorites, status],
  );

  const openFavorites = useCallback(
    async () => status === "authenticated",
    [status],
  );

  const isFavorite = useCallback(
    (lotId: number) => favorites.has(lotId),
    [favorites],
  );

  return {
    favorites,
    count: favorites.size,
    toggleFavorite,
    openFavorites,
    signInToContinue,
    isFavorite,
    loaded,
    isAuthenticated: status === "authenticated",
    isPendingAuth: submitting || status === "loading",
  };
}
