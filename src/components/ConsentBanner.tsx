"use client";

import { useEffect, useState } from "react";
import {
  applyConsentChoice,
  readConsentChoice,
  type ConsentChoice,
  writeConsentChoice,
} from "@/lib/consent";

export function ConsentBanner() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedChoice = readConsentChoice();
    setChoice(storedChoice);
    if (storedChoice) {
      applyConsentChoice(storedChoice);
    }
    setReady(true);
  }, []);

  const handleChoice = (nextChoice: ConsentChoice) => {
    writeConsentChoice(nextChoice);
    applyConsentChoice(nextChoice);
    setChoice(nextChoice);
  };

  if (!ready || choice) {
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
              Får vi använda statistikcookies?
            </h2>
            <p className="mt-2 text-[15px] leading-6 text-brand-700">
              Vi använder Google Analytics för att forsta hur sokningen och
              sajten anvands. Du kan godkanna eller neka statistikcookies.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:min-w-[250px] sm:max-w-[250px]">
            <button
              type="button"
              onClick={() => handleChoice("accepted")}
              className="inline-flex min-h-12 items-center justify-center rounded-3xl bg-brand-950 px-4 py-3 text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(25,20,13,0.18)] transition-colors hover:bg-brand-800"
            >
              Godkann statistik
            </button>
            <button
              type="button"
              onClick={() => handleChoice("rejected")}
              className="inline-flex min-h-11 items-center justify-center rounded-3xl border border-brand-300 bg-white px-4 py-2.5 text-[15px] font-semibold text-brand-700 transition-colors hover:border-brand-400 hover:text-brand-900"
            >
              Neka
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
