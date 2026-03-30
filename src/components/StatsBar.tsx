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

  return (
    <div className="mb-4 grid grid-cols-3 gap-x-2 rounded-xl border border-brand-200/40 bg-white px-3 py-2 shadow-card sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2 sm:px-5 sm:py-3">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-5"
        >
          <div className="flex min-w-0 flex-col text-center sm:flex-row sm:items-baseline sm:gap-1.5 sm:text-left">
            <span className="order-1 text-[11px] leading-tight text-brand-400 sm:order-2 sm:text-xs">
              {stat.label}
            </span>
            <span className="order-2 truncate font-semibold text-[13px] text-brand-900 sm:order-1 sm:text-sm">
              {stat.num}
            </span>
          </div>
          {i < stats.length - 1 && (
            <div className="w-px h-5 bg-brand-200 hidden sm:block" />
          )}
        </div>
      ))}
    </div>
  );
}
