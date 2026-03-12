"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Build a page-number array like [1, '…', 4, 5, 6, 7, 8, '…', 20]
 * showing a wider window around the current page.
 */
function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 11) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [1];

  if (current > 5) pages.push("…");

  const start = Math.max(2, current - 3);
  const end = Math.min(total - 1, current + 3);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 4) pages.push("…");

  pages.push(total);
  return pages;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages = buildPages(page, totalPages);

  const btn =
    "flex items-center justify-center rounded-lg border text-sm font-medium transition-colors";

  return (
    <div className={`${className ?? "mt-10"}`}>
      <div className="flex items-center justify-center gap-1.5">
        {/* Prev */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={`${btn} h-10 min-w-10 border-brand-200 bg-white px-2 text-brand-600
          disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-50`}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page numbers */}
        <div className="hidden items-center gap-1.5 sm:flex">
          {pages.map((p, idx) =>
            p === "…" ? (
              <span
                key={`ellipsis-${idx}`}
                className="w-9 h-9 flex items-center justify-center text-brand-400 text-sm select-none"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`${btn} w-9 h-9 ${
                  p === page
                    ? "bg-brand-900 border-brand-900 text-white"
                    : "border-brand-200 bg-white text-brand-600 hover:bg-brand-50"
                }`}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <span className="flex h-10 min-w-[4.25rem] items-center justify-center rounded-lg border border-brand-200 bg-white px-3 text-sm font-medium text-brand-700 sm:hidden">
          {page} / {totalPages}
        </span>

        {/* Next */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={`${btn} h-10 min-w-10 border-brand-200 bg-white px-2 text-brand-600
          disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-50`}
        >
          <ChevronRight size={16} />
        </button>

        <span className="ml-2 hidden text-xs text-brand-400 sm:inline">
          Sida {page} av {totalPages}
        </span>
      </div>

      <div className="mt-2 text-center text-xs text-brand-400 sm:hidden">
        Sida {page} av {totalPages}
      </div>
    </div>
  );
}
