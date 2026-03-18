"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CONSENT_UPDATED_EVENT,
  readConsentChoice,
  type ConsentChoice,
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
  const [consentChoice, setConsentChoice] = useState<ConsentChoice | null>(
    null,
  );

  useEffect(() => {
    setConsentChoice(readConsentChoice());

    const handleConsentUpdate = (event: Event) => {
      const detail = (event as CustomEvent<ConsentChoice>).detail;
      setConsentChoice(detail);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key == null || event.key === "auktio-consent-v1") {
        setConsentChoice(readConsentChoice());
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
    if (consentChoice !== "accepted") {
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
  }, [consentChoice, measurementId, pathname, searchParams]);

  return null;
}
