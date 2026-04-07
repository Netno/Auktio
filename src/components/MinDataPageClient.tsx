"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import {
  applyConsentPreferences,
  readConsentPreferences,
  writeConsentPreferences,
} from "@/lib/consent";

type MinDataPayload = {
  preferences: {
    personalizationEnabled: boolean;
    searchHistoryEnabled: boolean;
  };
  summary: {
    searches: number;
    favorites: number;
    matches: number;
  };
  recentSearches: Array<{
    id: number;
    queryText: string | null;
    selectedCategories: string[];
    createdAt: string;
  }>;
  profile: {
    topCategories: string[];
    sourceBreakdown: Record<string, unknown>;
    avgPriceRange: Record<string, unknown>;
    updatedAt: string | null;
  };
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Saknas";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saknas";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function MinDataPageClient() {
  const [data, setData] = useState<MinDataPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/me/data", { cache: "no-store" });
      const payload = (await response.json()) as MinDataPayload & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Kunde inte ladda Min data.");
      }

      setData(payload);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Kunde inte ladda Min data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updatePreference = useCallback(
    async (nextPreferences: {
      personalizationEnabled?: boolean;
      searchHistoryEnabled?: boolean;
    }) => {
      setSaving(true);
      setMessage(null);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/me/data/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextPreferences),
        });
        const payload = (await response.json()) as {
          error?: string;
          preferences?: MinDataPayload["preferences"];
        };

        if (!response.ok || !payload.preferences) {
          throw new Error(payload.error ?? "Kunde inte spara inställningen.");
        }

        setData((current) =>
          current
            ? {
                ...current,
                preferences: payload.preferences!,
              }
            : current,
        );

        if (typeof nextPreferences.personalizationEnabled === "boolean") {
          const currentConsent = readConsentPreferences() ?? {
            analytics: false,
            personalization: false,
          };
          const nextConsent = {
            analytics: currentConsent.analytics,
            personalization: nextPreferences.personalizationEnabled,
          };

          writeConsentPreferences(nextConsent);
          applyConsentPreferences(nextConsent);
        }

        setMessage("Inställningen uppdaterades.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Kunde inte spara inställningen.",
        );
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const clearPersonalData = useCallback(async () => {
    setClearing(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/me/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disablePersonalization: true }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Kunde inte rensa personlig data.");
      }

      const currentConsent = readConsentPreferences() ?? {
        analytics: false,
        personalization: false,
      };
      const nextConsent = {
        analytics: currentConsent.analytics,
        personalization: false,
      };

      writeConsentPreferences(nextConsent);
      applyConsentPreferences(nextConsent);

      setMessage("Din sökhistorik och rekommendationsdata har rensats.");
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Kunde inte rensa personlig data.",
      );
    } finally {
      setClearing(false);
    }
  }, [loadData]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f1eb_0%,#fbf8f6_26%,#f8f4f0_100%)]">
      <Header activeView="account" />

      <main className="mx-auto max-w-[1100px] px-4 pb-20 pt-8 sm:px-6">
        <div className="rounded-[30px] border border-brand-200 bg-white/90 p-6 shadow-card sm:p-8">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-700">
              Min data
            </p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-brand-950">
              Kontroll över sökhistorik och personalisering
            </h1>
            <p className="mt-3 text-sm leading-6 text-brand-700">
              Här ser du vad som används för För dig, kan exportera dina data
              och rensa historik om du inte längre vill att systemet bygger
              rekommendationer på ditt beteende.
            </p>
          </div>

          {message ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {errorMessage}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-3xl border border-brand-200 bg-brand-50"
                />
              ))}
            </div>
          ) : data ? (
            <>
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <div className="rounded-3xl border border-brand-200 bg-brand-50 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                    Sökningar
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-brand-950">
                    {data.summary.searches.toLocaleString("sv-SE")}
                  </div>
                  <p className="mt-2 text-sm text-brand-700">
                    Meningsfulla sökningar sparade på kontot.
                  </p>
                </div>
                <div className="rounded-3xl border border-brand-200 bg-brand-50 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                    Favoriter
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-brand-950">
                    {data.summary.favorites.toLocaleString("sv-SE")}
                  </div>
                  <p className="mt-2 text-sm text-brand-700">
                    Bevakningar som också kan användas i För dig.
                  </p>
                </div>
                <div className="rounded-3xl border border-brand-200 bg-brand-50 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                    Matchningar
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-brand-950">
                    {data.summary.matches.toLocaleString("sv-SE")}
                  </div>
                  <p className="mt-2 text-sm text-brand-700">
                    Aktuella rekommendationer som väntar på att visas.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <section className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                  <h2 className="text-lg font-semibold text-brand-950">
                    Inställningar
                  </h2>
                  <div className="mt-4 space-y-4">
                    <label className="flex items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                      <div>
                        <div className="text-sm font-medium text-brand-950">
                          Personalisering
                        </div>
                        <p className="mt-1 text-sm leading-6 text-brand-700">
                          Tillåt att favoriter och sökhistorik används för att
                          bygga För dig.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={data.preferences.personalizationEnabled}
                        disabled={saving}
                        onChange={(event) =>
                          void updatePreference({
                            personalizationEnabled: event.target.checked,
                          })
                        }
                        className="mt-1 h-5 w-5 rounded border-brand-300 text-brand-900"
                      />
                    </label>

                    <label className="flex items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                      <div>
                        <div className="text-sm font-medium text-brand-950">
                          Spara sökhistorik
                        </div>
                        <p className="mt-1 text-sm leading-6 text-brand-700">
                          Behåll meningsfulla sökningar på kontot för bättre
                          förståelse av dina intressen över tid.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={data.preferences.searchHistoryEnabled}
                        disabled={saving}
                        onChange={(event) =>
                          void updatePreference({
                            searchHistoryEnabled: event.target.checked,
                          })
                        }
                        className="mt-1 h-5 w-5 rounded border-brand-300 text-brand-900"
                      />
                    </label>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <a
                      href="/api/me/data/export"
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      Exportera min data
                    </a>
                    <button
                      type="button"
                      onClick={() => void clearPersonalData()}
                      disabled={clearing}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-950 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Rensa sökhistorik och För dig-data
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                  <h2 className="text-lg font-semibold text-brand-950">
                    Profilsammanfattning
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-brand-700">
                    Senast uppdaterad: {formatDateTime(data.profile.updatedAt)}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {data.profile.topCategories.length > 0 ? (
                      data.profile.topCategories.map((category) => (
                        <span
                          key={category}
                          className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-800"
                        >
                          {category}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-brand-500">
                        Ingen profil har byggts ännu.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700">
                    <div className="font-medium text-brand-950">
                      Så används datan
                    </div>
                    <p className="mt-2 leading-6">
                      För dig prioriterar bevakningar högst och kombinerar dem
                      med meningsfulla sökningar. Om du stänger av
                      personalisering slutar nya signaler att användas och du
                      kan rensa tidigare data härifrån.
                    </p>
                  </div>

                  <div className="mt-5">
                    <Link
                      href="/"
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      Tillbaka till föremål
                    </Link>
                  </div>
                </section>
              </div>

              <section className="mt-6 rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                <h2 className="text-lg font-semibold text-brand-950">
                  Senaste sökningar
                </h2>
                {data.recentSearches.length === 0 ? (
                  <p className="mt-3 text-sm text-brand-600">
                    Inga sökningar har sparats ännu.
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm text-brand-700">
                      <thead>
                        <tr className="border-b border-brand-200 text-[11px] uppercase tracking-[0.12em] text-brand-500">
                          <th className="pb-2 pr-4 font-semibold">Sökning</th>
                          <th className="pb-2 pr-4 font-semibold">
                            Kategorier
                          </th>
                          <th className="pb-2 font-semibold">Tid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentSearches.map((search) => (
                          <tr
                            key={search.id}
                            className="border-b border-brand-100 align-top last:border-b-0"
                          >
                            <td className="py-3 pr-4 text-brand-950">
                              {search.queryText?.trim() ||
                                "Kategorival utan text"}
                            </td>
                            <td className="py-3 pr-4">
                              {search.selectedCategories.length > 0
                                ? search.selectedCategories.join(", ")
                                : "-"}
                            </td>
                            <td className="py-3">
                              {formatDateTime(search.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
