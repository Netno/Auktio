"use client";

import { formatAmount } from "@/lib/utils";
import type { Lot, SearchStatus } from "@/lib/types";

interface StatsBarProps {
  lots: Lot[];
  total: number;
  status: SearchStatus;
  windowCount: number;
  totalValue: number;
  totalValueCurrency: string | null;
  totalValueHasMixedCurrencies: boolean;
}

export function StatsBar({
  lots,
  total,
  status,
  windowCount,
  totalValue,
  totalValueCurrency,
  totalValueHasMixedCurrencies,
}: StatsBarProps) {
  const valueLots = lots
    .map((lot) => {
      const amount = lot.isActive
        ? lot.currentBid
        : lot.availability === "sold"
          ? lot.soldPrice
          : lot.currentBid;

      return {
        amount,
        currency: (lot.currency || "SEK").toUpperCase(),
      };
    })
    .filter(
      (lot): lot is { amount: number; currency: string } => lot.amount != null,
    );

  const currencies = Array.from(new Set(valueLots.map((lot) => lot.currency)));
  const hasMixedCurrencies = currencies.length > 1;
  const fallbackTotalValue = valueLots.reduce(
    (sum, lot) => sum + lot.amount,
    0,
  );
  const resolvedTotalValueHasMixedCurrencies =
    totalValueHasMixedCurrencies ?? hasMixedCurrencies;
  const resolvedTotalValueCurrency =
    totalValueCurrency ?? currencies[0] ?? "SEK";
  const resolvedTotalValue = totalValue ?? fallbackTotalValue;
  const totalValueDisplay = resolvedTotalValueHasMixedCurrencies
    ? "Flera valutor"
    : formatAmount(resolvedTotalValue, resolvedTotalValueCurrency);
  const totalValueLabel = resolvedTotalValueHasMixedCurrencies
    ? status === "ended"
      ? "slutvärde ej summerat"
      : "budvärde ej summerat"
    : status === "ended"
      ? "slutvärde"
      : "totalt budvärde";

  const fallbackWindowCount = lots.filter((lot) => {
    if (!lot.endTime) return false;
    const diff = new Date(lot.endTime).getTime() - Date.now();
    if (status === "ended") {
      return !lot.isActive && Math.abs(diff) < 86_400_000;
    }
    return diff > 0 && diff < 86_400_000;
  }).length;

  const visibleEndedCount = lots.filter((lot) => !lot.isActive).length;

  const resolvedWindowCount =
    windowCount > 0
      ? windowCount
      : fallbackWindowCount > 0
        ? fallbackWindowCount
        : status === "ended"
          ? visibleEndedCount
          : 0;

  const stats = [
    {
      num: String(total),
      label:
        status === "ended"
          ? "avslutade föremål"
          : status === "all"
            ? "föremål"
            : "aktiva föremål",
    },
    {
      num: totalValueDisplay,
      label: totalValueLabel,
    },
    {
      num: String(resolvedWindowCount),
      label:
        status === "ended"
          ? "avslutade senaste 24h"
          : status === "all"
            ? "aktiva avslutas inom 24h"
            : "avslutas inom 24h",
    },
  ];

  const mobileStatusLabel =
    status === "ended"
      ? "Avslutade objekt"
      : status === "all"
        ? "Alla objekt"
        : "Pågående auktioner";

  return (
    <>
      <div className="mb-4 sm:hidden">
        <div className="overflow-hidden rounded-2xl border border-brand-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,240,235,0.96))] px-3 py-3 shadow-[0_14px_30px_rgba(93,69,40,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-600">
                Marknadslage
              </p>
              <p className="mt-1 text-[13px] font-medium text-brand-800">
                {mobileStatusLabel}
              </p>
            </div>

            <div className="flex shrink-0 gap-1.5">
              <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-semibold text-brand-800">
                {total.toLocaleString("sv-SE")} objekt
              </span>
              <span className="rounded-full bg-accent-50 px-2.5 py-1 text-[11px] font-semibold text-accent-700">
                {resolvedWindowCount.toLocaleString("sv-SE")} snart
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden rounded-xl border border-brand-200/40 bg-white px-5 py-3 shadow-card sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className="flex min-w-0 flex-row items-center gap-5"
          >
            <div className="flex min-w-0 flex-row items-baseline gap-1.5 text-left">
              <span className="truncate text-sm font-semibold text-brand-900">
                {stat.num}
              </span>
              <span className="text-xs leading-tight text-brand-400">
                {stat.label}
              </span>
            </div>
            {i < stats.length - 1 && <div className="h-5 w-px bg-brand-200" />}
          </div>
        ))}
      </div>
    </>
  );
}
