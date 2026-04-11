export const CONSENT_STORAGE_KEY = "auktio-consent-v1";
export const CONSENT_UPDATED_EVENT = "auktio-consent-updated";

export type ConsentPreferences = {
  analytics: boolean;
  personalization: boolean;
};

export type ConsentChoice = ConsentPreferences;

export const CONSENT_PRESET_ALL: ConsentPreferences = {
  analytics: true,
  personalization: true,
};

export const CONSENT_PRESET_ANALYTICS_ONLY: ConsentPreferences = {
  analytics: true,
  personalization: false,
};

export const CONSENT_PRESET_ESSENTIAL_ONLY: ConsentPreferences = {
  analytics: false,
  personalization: false,
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function readConsentChoice(): ConsentChoice | null {
  return readConsentPreferences();
}

export function readConsentPreferences(): ConsentPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(CONSENT_STORAGE_KEY);

  if (storedValue === "accepted") {
    return CONSENT_PRESET_ALL;
  }

  if (storedValue === "rejected") {
    return CONSENT_PRESET_ESSENTIAL_ONLY;
  }

  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as unknown;

    if (
      typeof parsed !== "object" ||
      parsed == null ||
      typeof (parsed as ConsentPreferences).analytics !== "boolean" ||
      typeof (parsed as ConsentPreferences).personalization !== "boolean"
    ) {
      return null;
    }

    return {
      analytics: (parsed as ConsentPreferences).analytics,
      personalization: (parsed as ConsentPreferences).personalization,
    };
  } catch {
    return null;
  }
}

export function writeConsentChoice(choice: ConsentChoice) {
  writeConsentPreferences(choice);
}

export function writeConsentPreferences(preferences: ConsentPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(preferences));
}

export function applyConsentChoice(choice: ConsentChoice) {
  applyConsentPreferences(choice);
}

export function applyConsentPreferences(preferences: ConsentPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  const analyticsStorage = preferences.analytics ? "granted" : "denied";
  const personalizationStorage = preferences.personalization
    ? "granted"
    : "denied";

  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", {
      analytics_storage: analyticsStorage,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "granted",
      personalization_storage: personalizationStorage,
      security_storage: "granted",
    });

    if (preferences.analytics) {
      window.gtag("event", "consent_granted", {
        event_category: "consent",
        event_label: preferences.personalization
          ? "analytics_personalization"
          : "analytics_only",
      });
    }
  }

  window.dispatchEvent(
    new CustomEvent(CONSENT_UPDATED_EVENT, { detail: preferences }),
  );
}

export function hasAnalyticsConsent(
  preferences: ConsentPreferences | null | undefined,
) {
  return preferences?.analytics === true;
}

export function hasPersonalizationConsent(
  preferences: ConsentPreferences | null | undefined,
) {
  return preferences?.personalization === true;
}
