"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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

  useEffect(() => {
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
  }, [measurementId, pathname, searchParams]);

  return null;
}
