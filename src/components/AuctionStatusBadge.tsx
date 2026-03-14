import type { AuctionStatus } from "@/lib/types";

const STATUS_STYLES: Record<
  AuctionStatus,
  { label: string; className: string }
> = {
  ongoing: {
    label: "Pågår nu",
    className: "bg-emerald-50/60 text-emerald-700 border-emerald-200/80",
  },
  upcoming: {
    label: "Kommande",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  ended: {
    label: "Avslutad",
    className: "bg-brand-100 text-brand-600 border-brand-200",
  },
  uncertain: {
    label: "Kontrolleras",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

export function AuctionStatusBadge({ status }: { status: AuctionStatus }) {
  const config = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
