"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
  hasPersonalizationConsent,
  readConsentPreferences,
} from "@/lib/consent";

const STORAGE_KEY = "auktio_favorites";

type UseFavoritesOptions = {
  enabled?: boolean;
};

function readStoredFavoriteLotIds() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return [];
    }

    return (JSON.parse(stored) as number[]).filter(
      (lotId) => Number.isInteger(lotId) && lotId > 0,
    );
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function useFavorites(options: UseFavoritesOptions = {}) {
  const { enabled = true } = options;
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
    if (!enabled) {
      setFavorites(new Set());
      setLoaded(true);
      return;
    }

    if (status === "loading") {
      return;
    }

    let cancelled = false;

    async function loadFavorites() {
      const storedLotIds = readStoredFavoriteLotIds();
      const canImportStoredFavorites =
        status === "authenticated" ||
        hasPersonalizationConsent(readConsentPreferences());
      let didImportStoredFavorites = false;

      try {
        let mergedLotIds: number[] = storedLotIds;

        if (storedLotIds.length > 0 && canImportStoredFavorites) {
          const importResponse = await fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lotIds: storedLotIds }),
          });

          if (importResponse.ok) {
            const importPayload = (await importResponse.json()) as {
              lotIds?: number[];
            };

            mergedLotIds = Array.isArray(importPayload.lotIds)
              ? importPayload.lotIds
              : mergedLotIds;
            didImportStoredFavorites = true;
            localStorage.removeItem(STORAGE_KEY);
          }
        }

        const response = await fetch("/api/favorites", { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Favorites failed: ${response.status}`);
        }

        const payload = (await response.json()) as { lotIds?: number[] };
        if (
          Array.isArray(payload.lotIds) &&
          (payload.lotIds.length > 0 ||
            mergedLotIds.length === 0 ||
            didImportStoredFavorites)
        ) {
          mergedLotIds = payload.lotIds;
        }

        if (!cancelled) {
          setFavorites(new Set(mergedLotIds));
        }
      } catch {
        if (!cancelled) {
          setFavorites(new Set(storedLotIds));
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
  }, [enabled, status]);

  const toggleFavorite = useCallback(
    async (lotId: number) => {
      if (!enabled) {
        return false;
      }

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
    [enabled, favorites, status],
  );

  const openFavorites = useCallback(
    async () => enabled && status === "authenticated",
    [enabled, status],
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
    isAuthenticated: enabled && status === "authenticated",
    isPendingAuth: submitting || status === "loading",
  };
}
