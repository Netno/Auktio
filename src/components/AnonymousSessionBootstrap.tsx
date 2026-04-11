"use client";

import { useEffect } from "react";
import {
  CONSENT_UPDATED_EVENT,
  hasPersonalizationConsent,
  readConsentPreferences,
  type ConsentPreferences,
} from "@/lib/consent";
import {
  clearAnonymousSessionId,
  ensureAnonymousSessionId,
} from "@/lib/anonymous-session";

function syncAnonymousSessionCookie(preferences: ConsentPreferences | null) {
  if (hasPersonalizationConsent(preferences)) {
    ensureAnonymousSessionId();
    return;
  }

  clearAnonymousSessionId();
}

export function AnonymousSessionBootstrap() {
  useEffect(() => {
    syncAnonymousSessionCookie(readConsentPreferences());

    const handleConsentUpdate = (event: Event) => {
      const detail = (event as CustomEvent<ConsentPreferences>).detail;
      syncAnonymousSessionCookie(detail);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key == null || event.key === "auktio-consent-v1") {
        syncAnonymousSessionCookie(readConsentPreferences());
      }
    };

    window.addEventListener(CONSENT_UPDATED_EVENT, handleConsentUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CONSENT_UPDATED_EVENT, handleConsentUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}
