"use client";

import { X } from "lucide-react";

interface BrowseAuthSheetProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmBusy?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function BrowseAuthSheet({
  open,
  title,
  description,
  confirmLabel = "Logga in",
  confirmBusy = false,
  onClose,
  onConfirm,
}: BrowseAuthSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] sm:hidden"
      aria-modal="true"
      role="dialog"
    >
      <button
        type="button"
        aria-label="Stäng"
        className="absolute inset-0 bg-brand-950/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 rounded-t-[22px] border border-brand-200 bg-white px-4 pb-6 pt-4 shadow-[0_-20px_48px_rgba(26,26,24,0.16)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
              Bevakningar
            </p>
            <h2 className="mt-1 text-base font-semibold text-brand-950">
              {title}
            </h2>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-brand-600">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng dialog"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-500 transition-colors hover:border-brand-300 hover:text-brand-900"
          >
            <X size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmBusy}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-950 disabled:cursor-wait disabled:opacity-70"
        >
          {confirmBusy ? "Öppnar inloggning..." : confirmLabel}
        </button>
      </div>
    </div>
  );
}
