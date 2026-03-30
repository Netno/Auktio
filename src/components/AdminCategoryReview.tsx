"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { AdminCategoryReviewLot } from "@/lib/admin-category-review";

type SearchParamEntry = {
  key: string;
  value: string;
};

type AdminCategoryReviewProps = {
  lots: AdminCategoryReviewLot[];
  reviewQuery: string;
  availableCategories: string[];
  preservedSearchParams: SearchParamEntry[];
  clearSearchHref: string;
};

type RowState = AdminCategoryReviewLot & {
  selectedCategory: string;
  note: string;
  statusMessage: string | null;
};

function createInitialRows(lots: AdminCategoryReviewLot[]): RowState[] {
  return lots.map((lot) => ({
    ...lot,
    selectedCategory: lot.categories[0] ?? "",
    note: "",
    statusMessage: null,
  }));
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("sv-SE", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TagList({
  items,
  emptyLabel,
  tone = "brand",
}: {
  items: string[];
  emptyLabel: string;
  tone?: "brand" | "accent" | "muted";
}) {
  const className =
    tone === "accent"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "muted"
        ? "border-brand-200 bg-white text-brand-500"
        : "border-brand-200 bg-brand-50 text-brand-700";

  if (items.length === 0) {
    return (
      <span
        className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${className}`}
      >
        {emptyLabel}
      </span>
    );
  }

  return (
    <>
      {items.map((item) => (
        <span
          key={item}
          className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${className}`}
        >
          {item}
        </span>
      ))}
    </>
  );
}

export function AdminCategoryReview({
  lots,
  reviewQuery,
  availableCategories,
  preservedSearchParams,
  clearSearchHref,
}: AdminCategoryReviewProps) {
  const [rows, setRows] = useState<RowState[]>(() => createInitialRows(lots));
  const [pendingLotId, setPendingLotId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(lotId: number, updater: (row: RowState) => RowState) {
    setRows((current) =>
      current.map((row) => (row.id === lotId ? updater(row) : row)),
    );
  }

  function runAction(lotId: number, action: "set" | "reclassify") {
    const row = rows.find((entry) => entry.id === lotId);
    if (!row) {
      return;
    }

    if (action === "set" && row.selectedCategory.length === 0) {
      updateRow(lotId, (current) => ({
        ...current,
        statusMessage: "Välj en kategori först.",
      }));
      return;
    }

    setPendingLotId(lotId);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/lots/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            lotId,
            categories: action === "set" ? [row.selectedCategory] : undefined,
            note: row.note,
          }),
        });

        const payload = (await response.json()) as {
          error?: string;
          lot?: AdminCategoryReviewLot;
          learningStored?: boolean;
          learningExampleCount?: number;
          reason?: string | null;
        };

        if (!response.ok || !payload.lot) {
          updateRow(lotId, (current) => ({
            ...current,
            statusMessage: payload.error ?? "Misslyckades",
          }));
          return;
        }

        const nextLot = payload.lot;

        updateRow(lotId, () => ({
          ...nextLot,
          selectedCategory: nextLot.categories[0] ?? "",
          note: row.note,
          statusMessage:
            action === "set"
              ? payload.learningStored
                ? "Kategori sparad. Feedback sparades för lärande."
                : "Kategori sparad. Feedbacktabellen saknas ännu, så lärande sparades inte."
              : payload.learningStored
                ? `AI-kategorisering klar. ${payload.learningExampleCount ?? 0} tidigare adminexempel användes${payload.reason ? `: ${payload.reason}` : "."}`
                : `AI-kategorisering klar${payload.reason ? `: ${payload.reason}` : "."}`,
        }));
      } catch (error) {
        updateRow(lotId, (current) => ({
          ...current,
          statusMessage:
            error instanceof Error ? error.message : "Misslyckades",
        }));
      } finally {
        setPendingLotId(null);
      }
    });
  }

  return (
    <div className="rounded-3xl border border-brand-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[13px] uppercase tracking-[0.12em] text-brand-500">
            kategori-review
          </div>
          <h2 className="mt-1 font-serif text-2xl text-brand-900">
            Sök upp och korrigera felklassade objekt
          </h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-brand-700">
            Hitta en lot på titel eller id, sätt rätt huvudkategori eller kör en
            ny AI-kategorisering. Manuella ändringar sparas som adminfeedback
            och kan användas som lärande när AI körs om.
          </p>
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50 px-3 py-2 text-[12px] text-brand-700">
          Problem som Peugeot i en pepparkvarn kan alltså rättas här utan att
          hela ingestflödet måste köras om.
        </div>
      </div>

      <form
        className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end"
        method="get"
      >
        {preservedSearchParams.map((entry) => (
          <input
            key={`${entry.key}:${entry.value}`}
            type="hidden"
            name={entry.key}
            value={entry.value}
          />
        ))}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-600">
            Titel eller lot-id
          </label>
          <input
            type="text"
            name="reviewQuery"
            defaultValue={reviewQuery}
            placeholder="Salt och pepparkvarn, peugeot, eller 2043020"
            className="h-11 w-full rounded-xl border border-brand-200 bg-white px-3 text-[14px] text-brand-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-950"
        >
          Sök lot
        </button>
        <Link
          href={clearSearchHref}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-800 transition hover:border-brand-300 hover:bg-brand-50"
        >
          Rensa sökningen
        </Link>
      </form>

      {reviewQuery.trim().length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-brand-200 bg-brand-50/70 px-4 py-5 text-[13px] text-brand-600">
          Sök på titel eller lot-id för att öppna kategori-granskningen.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-brand-200 bg-brand-50/70 px-4 py-5 text-[13px] text-brand-600">
          Ingen lot matchade sökningen <strong>{reviewQuery}</strong>.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const actionPending = isPending && pendingLotId === row.id;

            return (
              <div
                key={row.id}
                className="grid gap-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-4 lg:grid-cols-[112px_minmax(0,1fr)]"
              >
                <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
                  {row.thumbnailUrl ? (
                    <div className="relative aspect-square">
                      <Image
                        src={row.thumbnailUrl}
                        alt={row.title}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-square items-center justify-center px-3 text-center text-[12px] text-brand-500">
                      Ingen bild
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-brand-500">
                        <span>{row.houseName}</span>
                        <span>lot {row.id}</span>
                        <span>
                          {row.isActive
                            ? "aktiv"
                            : row.endTime
                              ? `slut ${formatDateTime(row.endTime)}`
                              : "arkiverad"}
                        </span>
                      </div>
                      <h3 className="mt-1 text-[18px] font-semibold leading-6 text-brand-950">
                        {row.title}
                      </h3>
                    </div>
                    {row.url && (
                      <Link
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-3 py-2 text-[12px] font-medium text-brand-800 transition hover:border-brand-300 hover:bg-brand-50"
                      >
                        Öppna lot
                      </Link>
                    )}
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
                        Nuvarande kategori
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <TagList
                          items={row.categories}
                          emptyLabel="Ingen kategori"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
                        AI-taggar
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <TagList
                          items={row.aiTags}
                          emptyLabel="Inga AI-taggar"
                          tone="accent"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
                        Råkategori från feed
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <TagList
                          items={row.rawCategories}
                          emptyLabel="Ingen råkategori"
                          tone="muted"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto_auto] xl:items-end">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-600">
                        Sätt huvudkategori
                      </label>
                      <select
                        value={row.selectedCategory}
                        onChange={(event) =>
                          updateRow(row.id, (current) => ({
                            ...current,
                            selectedCategory: event.target.value,
                            statusMessage: null,
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-brand-200 bg-white px-3 text-[13px] text-brand-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                      >
                        <option value="">Välj kategori</option>
                        {availableCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-600">
                        Lärnotering
                      </label>
                      <input
                        type="text"
                        value={row.note}
                        onChange={(event) =>
                          updateRow(row.id, (current) => ({
                            ...current,
                            note: event.target.value,
                          }))
                        }
                        placeholder="Valfritt, t.ex. Peugeot är varumärke för kvarn"
                        className="h-11 w-full rounded-xl border border-brand-200 bg-white px-3 text-[13px] text-brand-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => runAction(row.id, "set")}
                      disabled={actionPending}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-900 bg-brand-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-950 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionPending ? "Sparar..." : "Spara kategori"}
                    </button>

                    <button
                      type="button"
                      onClick={() => runAction(row.id, "reclassify")}
                      disabled={actionPending}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionPending ? "Kör AI..." : "AI-kategorisera om"}
                    </button>
                  </div>

                  {row.statusMessage && (
                    <div className="rounded-2xl border border-brand-200 bg-white px-3 py-2 text-[12px] text-brand-700">
                      {row.statusMessage}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
