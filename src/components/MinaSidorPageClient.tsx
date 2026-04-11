"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Brain,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { Header } from "@/components/Header";
import {
  type CreateRecommendationRuleInput,
  type MinaSidorPayload,
  type MinaSidorTab,
  type RecommendationRuleStrictness,
  type RecommendationRuleSurface,
  type UpdateNotificationSettingsInput,
  type UserRecommendationRule,
} from "@/lib/mina-sidor";

type MinaSidorPageClientProps = {
  initialTab: MinaSidorTab;
};

type RuleDraft = {
  label: string;
  queryText: string;
  categories: string[];
  brandsOrMakers: string;
  houseIds: string[];
  minPrice: string;
  maxPrice: string;
  surface: RecommendationRuleSurface;
  strictness: RecommendationRuleStrictness;
  notificationTypes: string;
  cooldownHours: string;
};

const EMPTY_RULE_DRAFT: RuleDraft = {
  label: "",
  queryText: "",
  categories: [],
  brandsOrMakers: "",
  houseIds: [],
  minPrice: "",
  maxPrice: "",
  surface: "both",
  strictness: "blended",
  notificationTypes: "new_matching_lot",
  cooldownHours: "24",
};

const TAB_DEFINITIONS: Array<{
  id: MinaSidorTab;
  label: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    id: "overview",
    label: "Översikt",
    description: "Dina aktiva regler, träffar och senaste signaler.",
    icon: Sparkles,
  },
  {
    id: "rules",
    label: "Bevakningar",
    description: "Styr exakt vad som ska fångas upp för dig.",
    icon: SlidersHorizontal,
  },
  {
    id: "notifications",
    label: "Aviseringar",
    description: "Bestäm hur och när vi ska kontakta dig.",
    icon: Bell,
  },
  {
    id: "profile",
    label: "Din profil",
    description: "Se vad AI-profilen just nu förstärker.",
    icon: Brain,
  },
  {
    id: "privacy",
    label: "Integritet",
    description: "Överblick och kontroll över lagrade data.",
    icon: ShieldCheck,
  },
];

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

function formatCurrency(value: number | null) {
  if (value == null) {
    return "Saknas";
  }

  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildRulePayload(draft: RuleDraft): CreateRecommendationRuleInput {
  return {
    label: draft.label || undefined,
    queryText: draft.queryText || null,
    categories: draft.categories,
    brandsOrMakers: parseCsv(draft.brandsOrMakers),
    houseIds: draft.houseIds,
    minPrice: draft.minPrice ? Number(draft.minPrice) : null,
    maxPrice: draft.maxPrice ? Number(draft.maxPrice) : null,
    surface: draft.surface,
    strictness: draft.strictness,
    notificationTypes: parseCsv(draft.notificationTypes),
    cooldownHours: draft.cooldownHours ? Number(draft.cooldownHours) : 24,
  };
}

function buildRuleDraftFromRule(rule: UserRecommendationRule): RuleDraft {
  return {
    label: rule.label,
    queryText: rule.queryText ?? "",
    categories: [...rule.categories],
    brandsOrMakers: rule.brandsOrMakers.join(", "),
    houseIds: [...rule.houseIds],
    minPrice: rule.minPrice != null ? String(rule.minPrice) : "",
    maxPrice: rule.maxPrice != null ? String(rule.maxPrice) : "",
    surface: rule.surface,
    strictness: rule.strictness,
    notificationTypes: rule.notificationTypes.join(", "),
    cooldownHours: String(rule.cooldownHours),
  };
}

function toggleStringValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

function RuleSummary({ rule }: { rule: UserRecommendationRule }) {
  const parts = [
    rule.queryText ? `Fras: ${rule.queryText}` : null,
    rule.categories.length ? `Kategorier: ${rule.categories.join(", ")}` : null,
    rule.brandsOrMakers.length
      ? `Varumärken: ${rule.brandsOrMakers.join(", ")}`
      : null,
    rule.houseIds.length ? `Hus: ${rule.houseIds.join(", ")}` : null,
    rule.minPrice != null || rule.maxPrice != null
      ? `Pris: ${formatCurrency(rule.minPrice)} - ${formatCurrency(rule.maxPrice)}`
      : null,
  ].filter(Boolean);

  if (!parts.length) {
    return (
      <p className="text-sm text-brand-600">Ingen detaljsammanfattning ännu.</p>
    );
  }

  return <p className="text-sm leading-6 text-brand-700">{parts.join(". ")}</p>;
}

export function MinaSidorPageClient({ initialTab }: MinaSidorPageClientProps) {
  const [activeTab, setActiveTab] = useState<MinaSidorTab>(initialTab);
  const [data, setData] = useState<MinaSidorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [creatingRule, setCreatingRule] = useState(false);
  const [updatingRuleId, setUpdatingRuleId] = useState<number | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(EMPTY_RULE_DRAFT);
  const [notificationForm, setNotificationForm] =
    useState<UpdateNotificationSettingsInput>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/me/mina-sidor", { cache: "no-store" });
      const payload = (await response.json()) as MinaSidorPayload & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Kunde inte ladda Mina Sidor.");
      }

      setData(payload);
      setNotificationForm({
        emailEnabled: payload.notificationSettings.emailEnabled,
        digestFrequency: payload.notificationSettings.digestFrequency,
        instantEnabled: payload.notificationSettings.instantEnabled,
        quietHoursStart: payload.notificationSettings.quietHoursStart,
        quietHoursEnd: payload.notificationSettings.quietHoursEnd,
        maxNotificationsPerDay:
          payload.notificationSettings.maxNotificationsPerDay,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Kunde inte ladda Mina Sidor.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeTabDefinition = useMemo(
    () =>
      TAB_DEFINITIONS.find((tab) => tab.id === activeTab) ?? TAB_DEFINITIONS[0],
    [activeTab],
  );

  const handleSaveNotifications = useCallback(async () => {
    setSavingNotifications(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/me/notification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationForm),
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Kunde inte spara aviseringar.");
      }

      setMessage("Aviseringsinställningarna uppdaterades.");
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Kunde inte spara aviseringar.",
      );
    } finally {
      setSavingNotifications(false);
    }
  }, [loadData, notificationForm]);

  const handleCreateRule = useCallback(async () => {
    setCreatingRule(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/me/recommendation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRulePayload(ruleDraft)),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Kunde inte skapa bevakningen.");
      }

      setMessage("Ny bevakning skapades.");
      setRuleDraft(EMPTY_RULE_DRAFT);
      await loadData();
      setActiveTab("rules");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Kunde inte skapa bevakningen.",
      );
    } finally {
      setCreatingRule(false);
    }
  }, [loadData, ruleDraft]);

  const handleUpdateRule = useCallback(async () => {
    if (!editingRuleId) {
      return;
    }

    setCreatingRule(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/me/recommendation-rules/${editingRuleId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRulePayload(ruleDraft)),
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Kunde inte uppdatera bevakningen.");
      }

      setMessage("Bevakningen uppdaterades.");
      setEditingRuleId(null);
      setRuleDraft(EMPTY_RULE_DRAFT);
      await loadData();
      setActiveTab("rules");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Kunde inte uppdatera bevakningen.",
      );
    } finally {
      setCreatingRule(false);
    }
  }, [editingRuleId, loadData, ruleDraft]);

  const handleStartEditingRule = useCallback((rule: UserRecommendationRule) => {
    setEditingRuleId(rule.id);
    setRuleDraft(buildRuleDraftFromRule(rule));
    setMessage(null);
    setErrorMessage(null);
  }, []);

  const handleCancelRuleEdit = useCallback(() => {
    setEditingRuleId(null);
    setRuleDraft(EMPTY_RULE_DRAFT);
    setMessage(null);
    setErrorMessage(null);
  }, []);

  const handleToggleRule = useCallback(
    async (rule: UserRecommendationRule) => {
      setUpdatingRuleId(rule.id);
      setMessage(null);
      setErrorMessage(null);

      try {
        const response = await fetch(
          `/api/me/recommendation-rules/${rule.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: !rule.enabled }),
          },
        );
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Kunde inte uppdatera bevakningen.");
        }

        setMessage(
          rule.enabled ? "Bevakningen pausades." : "Bevakningen aktiverades.",
        );
        await loadData();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Kunde inte uppdatera bevakningen.",
        );
      } finally {
        setUpdatingRuleId(null);
      }
    },
    [loadData],
  );

  const handleDeleteRule = useCallback(
    async (ruleId: number) => {
      setUpdatingRuleId(ruleId);
      setMessage(null);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/me/recommendation-rules/${ruleId}`, {
          method: "DELETE",
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Kunde inte ta bort bevakningen.");
        }

        setMessage("Bevakningen togs bort.");
        await loadData();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Kunde inte ta bort bevakningen.",
        );
      } finally {
        setUpdatingRuleId(null);
      }
    },
    [loadData],
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f1eb_0%,#fbf8f6_24%,#f8f4f0_100%)]">
      <Header activeView="account" />

      <main className="mx-auto max-w-[1180px] px-4 pb-20 pt-8 sm:px-6">
        <div className="rounded-[30px] border border-brand-200 bg-white/90 p-6 shadow-card sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-700">
                Mina Sidor
              </p>
              <h1 className="mt-3 font-serif text-4xl leading-tight text-brand-950">
                Personliga bevakningar, aviseringar och AI-profil på ett ställe
              </h1>
              <p className="mt-3 text-sm leading-6 text-brand-700">
                Här styr du både explicita regler och hur Auktio får använda din
                profil för att hitta relevanta objekt över tid.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
              <div className="rounded-3xl border border-brand-200 bg-brand-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  Aktiv flik
                </div>
                <div className="mt-2 text-lg font-semibold text-brand-950">
                  {activeTabDefinition.label}
                </div>
                <p className="mt-1 text-sm text-brand-700">
                  {activeTabDefinition.description}
                </p>
              </div>
              <div className="rounded-3xl border border-brand-200 bg-brand-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  Datahantering
                </div>
                <div className="mt-2 text-sm leading-6 text-brand-700">
                  Full export och rensning finns kvar under{" "}
                  <Link
                    href="/min-data"
                    className="font-medium text-brand-950 underline decoration-brand-300 underline-offset-4"
                  >
                    Min data
                  </Link>
                  .
                </div>
              </div>
            </div>
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

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {TAB_DEFINITIONS.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-3xl border px-4 py-4 text-left transition ${
                    activeTab === tab.id
                      ? "border-brand-900 bg-brand-900 text-white shadow-card"
                      : "border-brand-200 bg-brand-50 text-brand-900 hover:border-brand-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Icon size={16} />
                    <span>{tab.label}</span>
                  </div>
                  <p
                    className={`mt-2 text-sm leading-6 ${
                      activeTab === tab.id ? "text-white/80" : "text-brand-700"
                    }`}
                  >
                    {tab.description}
                  </p>
                </button>
              );
            })}
          </div>

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
            <div className="mt-6 space-y-6">
              {activeTab === "overview" ? (
                <>
                  <div className="grid gap-4 lg:grid-cols-4">
                    <div className="rounded-3xl border border-brand-200 bg-brand-50 p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                        Aktiva regler
                      </div>
                      <div className="mt-3 text-3xl font-semibold text-brand-950">
                        {data.overview.activeRulesCount}
                      </div>
                      <p className="mt-2 text-sm text-brand-700">
                        Explicita bevakningar som just nu är på.
                      </p>
                    </div>
                    <div className="rounded-3xl border border-brand-200 bg-brand-50 p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                        Notisredo
                      </div>
                      <div className="mt-3 text-3xl font-semibold text-brand-950">
                        {data.overview.notificationRuleCount}
                      </div>
                      <p className="mt-2 text-sm text-brand-700">
                        Regler som får skapa aviseringar eller digest.
                      </p>
                    </div>
                    <div className="rounded-3xl border border-brand-200 bg-brand-50 p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                        Pending alerts
                      </div>
                      <div className="mt-3 text-3xl font-semibold text-brand-950">
                        {data.overview.pendingAlertCount}
                      </div>
                      <p className="mt-2 text-sm text-brand-700">
                        Materialiserade träffar som ännu inte levererats.
                      </p>
                    </div>
                    <div className="rounded-3xl border border-brand-200 bg-brand-50 p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                        För dig-matchningar
                      </div>
                      <div className="mt-3 text-3xl font-semibold text-brand-950">
                        {data.overview.recommendationMatchCount}
                      </div>
                      <p className="mt-2 text-sm text-brand-700">
                        Aktiva rekommendationer för startsidan.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <section className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                      <h2 className="text-lg font-semibold text-brand-950">
                        Snabb status
                      </h2>
                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
                          <div className="text-sm font-medium text-brand-950">
                            Favoriter
                          </div>
                          <div className="mt-2 text-2xl font-semibold text-brand-950">
                            {data.overview.favoritesCount}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
                          <div className="text-sm font-medium text-brand-950">
                            Senaste sökningar
                          </div>
                          <div className="mt-2 text-2xl font-semibold text-brand-950">
                            {data.overview.recentSearchCount}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
                          <div className="text-sm font-medium text-brand-950">
                            Startsideregler
                          </div>
                          <div className="mt-2 text-2xl font-semibold text-brand-950">
                            {data.overview.homeRuleCount}
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 rounded-3xl border border-brand-200 bg-brand-50 p-5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                          AI-profil
                        </div>
                        <p className="mt-3 text-sm leading-6 text-brand-700">
                          Senast uppdaterad{" "}
                          {formatDateTime(data.profile.updatedAt)}. Profilen
                          används som mjuk ranking inom dina regler och som
                          fallback när det inte finns tydliga explicita
                          signaler.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {data.profile.topCategories.length > 0 ? (
                            data.profile.topCategories.map((category) => (
                              <span
                                key={category}
                                className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-[12px] font-medium text-brand-800"
                              >
                                {category}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-brand-500">
                              Profilen har ännu inte tillräckligt med signaler.
                            </span>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                      <h2 className="text-lg font-semibold text-brand-950">
                        Senaste sökningar
                      </h2>
                      <div className="mt-4 space-y-3">
                        {data.recentSearches.length > 0 ? (
                          data.recentSearches.map((search) => (
                            <div
                              key={search.id}
                              className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-medium text-brand-950">
                                  {search.query}
                                </div>
                                <div className="text-xs text-brand-600">
                                  {formatDateTime(search.searchedAt)}
                                </div>
                              </div>
                              <p className="mt-2 text-sm text-brand-700">
                                Resultat:{" "}
                                {search.resultCount != null
                                  ? search.resultCount.toLocaleString("sv-SE")
                                  : "Okänt"}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm leading-6 text-brand-700">
                            Inga sparade sökningar ännu. När sökhistorik är på
                            får du fler signaler här.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              ) : null}

              {activeTab === "rules" ? (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)]">
                  <section className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-brand-950">
                          Dina bevakningar
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-brand-700">
                          Explicita regler används som hårda signaler.
                          AI-profilen rankar inom det urval som reglerna släpper
                          igenom.
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-4">
                      {data.recommendationRules.length > 0 ? (
                        data.recommendationRules.map((rule) => (
                          <article
                            key={rule.id}
                            className="rounded-3xl border border-brand-200 bg-brand-50 p-5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-base font-semibold text-brand-950">
                                    {rule.label}
                                  </h3>
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${rule.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
                                  >
                                    {rule.enabled ? "Aktiv" : "Pausad"}
                                  </span>
                                  <span className="rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                                    {rule.surface}
                                  </span>
                                  <span className="rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                                    {rule.strictness}
                                  </span>
                                </div>
                                <p className="mt-2 text-xs text-brand-500">
                                  Senast uppdaterad{" "}
                                  {formatDateTime(rule.updatedAt)}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditingRule(rule)}
                                  disabled={updatingRuleId === rule.id}
                                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Redigera
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleRule(rule)}
                                  disabled={updatingRuleId === rule.id}
                                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {rule.enabled ? "Pausa" : "Aktivera"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteRule(rule.id)}
                                  disabled={updatingRuleId === rule.id}
                                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2 text-[13px] font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Ta bort
                                </button>
                              </div>
                            </div>

                            <div className="mt-4">
                              <RuleSummary rule={rule} />
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="rounded-3xl border border-dashed border-brand-300 bg-brand-50 p-6 text-sm leading-6 text-brand-700">
                          Du har ännu inga explicita bevakningar. Lägg till din
                          första regel för att styra kategorier, fraser, hus
                          eller prisnivå.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                    <h2 className="text-lg font-semibold text-brand-950">
                      {editingRuleId ? "Redigera bevakning" : "Ny bevakning"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-brand-700">
                      Första versionen fokuserar på fraser, kategorier,
                      varumärken, hus och prisintervall. Fler regeltyper kan
                      läggas ovanpå samma modell senare.
                    </p>

                    <div className="mt-5 space-y-4">
                      <label className="block">
                        <span className="text-sm font-medium text-brand-900">
                          Namn
                        </span>
                        <input
                          value={ruleDraft.label}
                          onChange={(event) =>
                            setRuleDraft((current) => ({
                              ...current,
                              label: event.target.value,
                            }))
                          }
                          className="mt-2 w-full rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400 focus:bg-white"
                          placeholder="Till exempel Designlampor under 5 000 kr"
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-brand-900">
                          Fras eller sökord
                        </span>
                        <input
                          value={ruleDraft.queryText}
                          onChange={(event) =>
                            setRuleDraft((current) => ({
                              ...current,
                              queryText: event.target.value,
                            }))
                          }
                          className="mt-2 w-full rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400 focus:bg-white"
                          placeholder="Till exempel Bruno Mathsson"
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-brand-900">
                          Kategorier
                        </span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {data.availableCategories.map((category) => {
                            const selected =
                              ruleDraft.categories.includes(category);

                            return (
                              <button
                                key={category}
                                type="button"
                                onClick={() =>
                                  setRuleDraft((current) => ({
                                    ...current,
                                    categories: toggleStringValue(
                                      current.categories,
                                      category,
                                    ),
                                  }))
                                }
                                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
                                  selected
                                    ? "border-brand-900 bg-brand-900 text-white"
                                    : "border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-300 hover:bg-white"
                                }`}
                              >
                                {category}
                              </button>
                            );
                          })}
                        </div>
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-brand-900">
                          Varumärken eller tillverkare
                        </span>
                        <input
                          value={ruleDraft.brandsOrMakers}
                          onChange={(event) =>
                            setRuleDraft((current) => ({
                              ...current,
                              brandsOrMakers: event.target.value,
                            }))
                          }
                          className="mt-2 w-full rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400 focus:bg-white"
                          placeholder="String, Svenskt Tenn"
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-brand-900">
                          Auktionshus
                        </span>
                        <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-brand-200 bg-brand-50 p-3">
                          <div className="flex flex-wrap gap-2">
                            {data.availableHouses.map((house) => {
                              const selected = ruleDraft.houseIds.includes(
                                house.value,
                              );

                              return (
                                <button
                                  key={house.value}
                                  type="button"
                                  onClick={() =>
                                    setRuleDraft((current) => ({
                                      ...current,
                                      houseIds: toggleStringValue(
                                        current.houseIds,
                                        house.value,
                                      ),
                                    }))
                                  }
                                  className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
                                    selected
                                      ? "border-brand-900 bg-brand-900 text-white"
                                      : "border-brand-200 bg-white text-brand-800 hover:border-brand-300"
                                  }`}
                                >
                                  {house.label}
                                  <span className="ml-2 opacity-70">
                                    {house.count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-medium text-brand-900">
                            Minpris
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={ruleDraft.minPrice}
                            onChange={(event) =>
                              setRuleDraft((current) => ({
                                ...current,
                                minPrice: event.target.value,
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400 focus:bg-white"
                            placeholder="0"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-brand-900">
                            Maxpris
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={ruleDraft.maxPrice}
                            onChange={(event) =>
                              setRuleDraft((current) => ({
                                ...current,
                                maxPrice: event.target.value,
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400 focus:bg-white"
                            placeholder="5000"
                          />
                        </label>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-medium text-brand-900">
                            Yta
                          </span>
                          <select
                            value={ruleDraft.surface}
                            onChange={(event) =>
                              setRuleDraft((current) => ({
                                ...current,
                                surface: event.target
                                  .value as RecommendationRuleSurface,
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400 focus:bg-white"
                          >
                            <option value="both">Hem + aviseringar</option>
                            <option value="home">Bara hem</option>
                            <option value="notification">
                              Bara aviseringar
                            </option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-brand-900">
                            Regelläge
                          </span>
                          <select
                            value={ruleDraft.strictness}
                            onChange={(event) =>
                              setRuleDraft((current) => ({
                                ...current,
                                strictness: event.target
                                  .value as RecommendationRuleStrictness,
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400 focus:bg-white"
                          >
                            <option value="blended">Blended</option>
                            <option value="strict">Strict</option>
                          </select>
                        </label>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-medium text-brand-900">
                            Notistyper
                          </span>
                          <input
                            value={ruleDraft.notificationTypes}
                            onChange={(event) =>
                              setRuleDraft((current) => ({
                                ...current,
                                notificationTypes: event.target.value,
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400 focus:bg-white"
                            placeholder="new_matching_lot"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-brand-900">
                            Cooldown i timmar
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={ruleDraft.cooldownHours}
                            onChange={(event) =>
                              setRuleDraft((current) => ({
                                ...current,
                                cooldownHours: event.target.value,
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400 focus:bg-white"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            void (editingRuleId
                              ? handleUpdateRule()
                              : handleCreateRule())
                          }
                          disabled={creatingRule}
                          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-brand-900 px-4 py-3 text-[13px] font-medium text-white transition hover:bg-brand-950 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {creatingRule
                            ? editingRuleId
                              ? "Uppdaterar bevakning..."
                              : "Skapar bevakning..."
                            : editingRuleId
                              ? "Spara ändringar"
                              : "Skapa bevakning"}
                        </button>
                        {editingRuleId ? (
                          <button
                            type="button"
                            onClick={handleCancelRuleEdit}
                            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-brand-200 bg-white px-4 py-3 text-[13px] font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50"
                          >
                            Avbryt
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}

              {activeTab === "notifications" ? (
                <section className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                  <h2 className="text-lg font-semibold text-brand-950">
                    Aviseringar
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-brand-700">
                    Notifieringar och digest ska vara högprecision. Här styr du
                    leveransen separat från hur startsidan väljer innehåll.
                  </p>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                    <div className="space-y-4">
                      <label className="flex items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                        <div>
                          <div className="text-sm font-medium text-brand-950">
                            E-postutskick
                          </div>
                          <p className="mt-1 text-sm leading-6 text-brand-700">
                            Skicka notifieringar och digest till din
                            e-postadress.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(notificationForm.emailEnabled)}
                          onChange={(event) =>
                            setNotificationForm((current) => ({
                              ...current,
                              emailEnabled: event.target.checked,
                            }))
                          }
                          className="mt-1 h-5 w-5 rounded border-brand-300 text-brand-900"
                        />
                      </label>

                      <label className="flex items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                        <div>
                          <div className="text-sm font-medium text-brand-950">
                            Direktaviseringar
                          </div>
                          <p className="mt-1 text-sm leading-6 text-brand-700">
                            Tillåt att högprecisionsträffar skickas utan att
                            vänta på nästa digest.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(notificationForm.instantEnabled)}
                          onChange={(event) =>
                            setNotificationForm((current) => ({
                              ...current,
                              instantEnabled: event.target.checked,
                            }))
                          }
                          className="mt-1 h-5 w-5 rounded border-brand-300 text-brand-900"
                        />
                      </label>
                    </div>

                    <div className="space-y-4">
                      <label className="block rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                        <span className="text-sm font-medium text-brand-950">
                          Digest
                        </span>
                        <select
                          value={notificationForm.digestFrequency ?? "daily"}
                          onChange={(event) =>
                            setNotificationForm((current) => ({
                              ...current,
                              digestFrequency: event.target
                                .value as UpdateNotificationSettingsInput["digestFrequency"],
                            }))
                          }
                          className="mt-2 w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400"
                        >
                          <option value="daily">Daglig</option>
                          <option value="off">Av</option>
                        </select>
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                          <span className="text-sm font-medium text-brand-950">
                            Quiet hours start
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="23"
                            value={notificationForm.quietHoursStart ?? ""}
                            onChange={(event) =>
                              setNotificationForm((current) => ({
                                ...current,
                                quietHoursStart:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400"
                          />
                        </label>
                        <label className="block rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                          <span className="text-sm font-medium text-brand-950">
                            Quiet hours slut
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="23"
                            value={notificationForm.quietHoursEnd ?? ""}
                            onChange={(event) =>
                              setNotificationForm((current) => ({
                                ...current,
                                quietHoursEnd:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400"
                          />
                        </label>
                      </div>

                      <label className="block rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                        <span className="text-sm font-medium text-brand-950">
                          Max antal notifieringar per dag
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={notificationForm.maxNotificationsPerDay ?? 6}
                          onChange={(event) =>
                            setNotificationForm((current) => ({
                              ...current,
                              maxNotificationsPerDay: Number(
                                event.target.value,
                              ),
                            }))
                          }
                          className="mt-2 w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm text-brand-950 outline-none transition focus:border-brand-400"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleSaveNotifications()}
                      disabled={savingNotifications}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-brand-900 px-5 py-3 text-[13px] font-medium text-white transition hover:bg-brand-950 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingNotifications ? "Sparar..." : "Spara aviseringar"}
                    </button>
                  </div>
                </section>
              ) : null}

              {activeTab === "profile" ? (
                <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]">
                  <div className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                    <h2 className="text-lg font-semibold text-brand-950">
                      Din AI-profil
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-brand-700">
                      Det här är inte en hård filtrering. Profilen används för
                      att vikta vad som visas högre när flera objekt matchar
                      samma regel eller fallback-flöde.
                    </p>

                    <div className="mt-5 rounded-3xl border border-brand-200 bg-brand-50 p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                        Toppsignaler
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {data.profile.topCategories.length > 0 ? (
                          data.profile.topCategories.map((category) => (
                            <span
                              key={category}
                              className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-[12px] font-medium text-brand-800"
                            >
                              {category}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-brand-500">
                            Profilsignaler visas här när användaren har
                            tillräckligt beteendeunderlag.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                    <h2 className="text-lg font-semibold text-brand-950">
                      Prisprofil
                    </h2>
                    <div className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                        <div className="text-sm font-medium text-brand-950">
                          Typiskt intervall
                        </div>
                        <p className="mt-2 text-sm leading-6 text-brand-700">
                          {formatCurrency(data.profile.priceMin)} -{" "}
                          {formatCurrency(data.profile.priceMax)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
                        <div className="text-sm font-medium text-brand-950">
                          Senast uppdaterad
                        </div>
                        <p className="mt-2 text-sm leading-6 text-brand-700">
                          {formatDateTime(data.profile.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {activeTab === "privacy" ? (
                <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                  <div className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                    <h2 className="text-lg font-semibold text-brand-950">
                      Dataöversikt
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-brand-700">
                      Mina Sidor använder samma grunddata som För dig. Den fulla
                      export- och rensningsytan finns fortsatt i Min data.
                    </p>

                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
                        <div className="text-sm font-medium text-brand-950">
                          Favoriter
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-brand-950">
                          {data.overview.favoritesCount}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
                        <div className="text-sm font-medium text-brand-950">
                          Sökningar
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-brand-950">
                          {data.overview.recentSearchCount}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
                        <div className="text-sm font-medium text-brand-950">
                          Matchningar
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-brand-950">
                          {data.overview.recommendationMatchCount}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-brand-200 bg-white p-5 shadow-card">
                    <h2 className="text-lg font-semibold text-brand-950">
                      Min data
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-brand-700">
                      Där finns kvar samma export, samtyckeshantering och
                      rensning som tidigare. Mina Sidor är kontrollcenter för
                      regler och aviseringar, inte ersättning för
                      datarättigheter.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        href="/min-data"
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50"
                      >
                        Öppna Min data
                      </Link>
                      <a
                        href="/api/me/data/export"
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50"
                      >
                        Exportera min data
                      </a>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
