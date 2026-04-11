"use client";

import { useEffect, useState } from "react";
import {
  applyConsentPreferences,
  CONSENT_PRESET_ALL,
  CONSENT_PRESET_ANALYTICS_ONLY,
  CONSENT_PRESET_ESSENTIAL_ONLY,
  readConsentPreferences,
  type ConsentPreferences,
  writeConsentPreferences,
} from "@/lib/consent";

export function ConsentBanner() {
  const [preferences, setPreferences] = useState<ConsentPreferences | null>(
    null,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedPreferences = readConsentPreferences();
    setPreferences(storedPreferences);
    if (storedPreferences) {
      applyConsentPreferences(storedPreferences);
    }
    setReady(true);
  }, []);

  const handleChoice = (nextPreferences: ConsentPreferences) => {
    writeConsentPreferences(nextPreferences);
    applyConsentPreferences(nextPreferences);
    setPreferences(nextPreferences);
  };

  if (!ready || preferences) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-[100] px-4 sm:bottom-5 sm:px-6">
      <div className="mx-auto max-w-2xl rounded-[28px] border border-brand-300 bg-white px-5 py-4 shadow-[0_26px_70px_rgba(36,29,18,0.24)] ring-1 ring-brand-950/5 backdrop-blur-xl sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <div className="max-w-[34rem]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
              Integritet
            </p>
            <h2 className="mt-1 text-[1.7rem] font-semibold leading-none text-brand-950 sm:text-[1.85rem]">
              Får vi använda statistik och personalisering?
            </h2>
            <p className="mt-2 text-[15px] leading-6 text-brand-700">
              Vi använder statistik för att förstå hur sajten används och
              personalisering för att på sikt kunna spara sökhistorik och visa
              relevanta föremål i För dig. Du väljer själv nivån.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:min-w-[250px] sm:max-w-[250px]">
            <button
              type="button"
              onClick={() => handleChoice(CONSENT_PRESET_ALL)}
              className="inline-flex min-h-12 items-center justify-center rounded-3xl bg-brand-950 px-4 py-3 text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(25,20,13,0.18)] transition-colors hover:bg-brand-800"
            >
              Godkänn alla
            </button>
            <button
              type="button"
              onClick={() => handleChoice(CONSENT_PRESET_ANALYTICS_ONLY)}
              className="inline-flex min-h-11 items-center justify-center rounded-3xl border border-brand-300 bg-white px-4 py-2.5 text-[15px] font-semibold text-brand-700 transition-colors hover:border-brand-400 hover:text-brand-900"
            >
              Endast statistik
            </button>
            <button
              type="button"
              onClick={() => handleChoice(CONSENT_PRESET_ESSENTIAL_ONLY)}
              className="inline-flex min-h-11 items-center justify-center rounded-3xl border border-brand-300 bg-white px-4 py-2.5 text-[15px] font-semibold text-brand-700 transition-colors hover:border-brand-400 hover:text-brand-900"
            >
              Endast nödvändiga
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
