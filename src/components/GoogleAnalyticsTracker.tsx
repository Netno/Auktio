"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CONSENT_UPDATED_EVENT,
  hasAnalyticsConsent,
  readConsentPreferences,
  type ConsentPreferences,
} from "@/lib/consent";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

interface GoogleAnalyticsTrackerProps {
  measurementId: string;
}

export function GoogleAnalyticsTracker({
  measurementId,
}: GoogleAnalyticsTrackerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPathRef = useRef<string | null>(null);
  const [consentPreferences, setConsentPreferences] =
    useState<ConsentPreferences | null>(null);

  useEffect(() => {
    setConsentPreferences(readConsentPreferences());

    const handleConsentUpdate = (event: Event) => {
      const detail = (event as CustomEvent<ConsentPreferences>).detail;
      setConsentPreferences(detail);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key == null || event.key === "auktio-consent-v1") {
        setConsentPreferences(readConsentPreferences());
      }
    };

    window.addEventListener(CONSENT_UPDATED_EVENT, handleConsentUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CONSENT_UPDATED_EVENT, handleConsentUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!hasAnalyticsConsent(consentPreferences)) {
      return;
    }

    const queryString = searchParams.toString();
    const pagePath = queryString ? `${pathname}?${queryString}` : pathname;

    if (!pagePath || lastTrackedPathRef.current === pagePath) {
      return;
    }

    lastTrackedPathRef.current = pagePath;

    if (typeof window === "undefined" || typeof window.gtag !== "function") {
      return;
    }

    window.gtag("config", measurementId, {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [consentPreferences, measurementId, pathname, searchParams]);

  return null;
}
