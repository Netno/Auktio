export const CONSENT_STORAGE_KEY = "auktio-consent-v1";
export const CONSENT_UPDATED_EVENT = "auktio-consent-updated";

export type ConsentChoice = "accepted" | "rejected";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function readConsentChoice(): ConsentChoice | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return storedValue === "accepted" || storedValue === "rejected"
    ? storedValue
    : null;
}

export function writeConsentChoice(choice: ConsentChoice) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
}

export function applyConsentChoice(choice: ConsentChoice) {
  if (typeof window === "undefined") {
    return;
  }

  const analyticsStorage = choice === "accepted" ? "granted" : "denied";

  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", {
      analytics_storage: analyticsStorage,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "granted",
      personalization_storage: "granted",
      security_storage: "granted",
    });

    if (choice === "accepted") {
      window.gtag("event", "consent_granted", {
        event_category: "consent",
        event_label: "analytics",
      });
    }
  }

  window.dispatchEvent(
    new CustomEvent(CONSENT_UPDATED_EVENT, { detail: choice }),
  );
}
