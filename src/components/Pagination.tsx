"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  showPageSizeSelector?: boolean;
  className?: string;
}

const PAGE_SIZE_OPTIONS = [48, 72, 96] as const;

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
  onPageSizeChange,
  showPageSizeSelector = false,
  className,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages = buildPages(page, totalPages);

  const btn =
    "flex items-center justify-center rounded-lg border text-sm font-medium transition-colors";
  const mobileBtn =
    "flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors";

  return (
    <div className={`${className ?? "mt-10"}`}>
      <div className="sm:hidden">
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className={`${mobileBtn} border-brand-200 bg-white text-brand-600
            disabled:cursor-not-allowed disabled:opacity-30 hover:bg-brand-50`}
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex min-w-[4.75rem] items-center justify-center rounded-lg border border-brand-200 bg-white px-2 py-2 text-center shadow-sm">
            <span className="text-sm font-semibold text-brand-900">{page}</span>
            <span className="mx-1.5 text-xs text-brand-300">/</span>
            <span className="text-xs font-medium text-brand-500">
              {totalPages}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className={`${mobileBtn} border-brand-200 bg-white text-brand-600
            disabled:cursor-not-allowed disabled:opacity-30 hover:bg-brand-50`}
          >
            <ChevronRight size={16} />
          </button>
          {showPageSizeSelector && onPageSizeChange && (
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="min-w-[4.75rem] rounded-lg border border-brand-200 bg-white px-2 py-2 text-[12px] text-brand-600 outline-none cursor-pointer"
              aria-label="Antal föremål per sida"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} st
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="hidden items-center justify-center gap-3 sm:flex">
        {/* Prev */}
        <button
          type="button"
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
                type="button"
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

        {/* Next */}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={`${btn} h-10 min-w-10 border-brand-200 bg-white px-2 text-brand-600
          disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-50`}
        >
          <ChevronRight size={16} />
        </button>

        <span className="ml-1 hidden text-xs text-brand-400 sm:inline">
          Sida {page} av {totalPages}
        </span>

        {showPageSizeSelector && onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="ml-2 min-w-[5.5rem] rounded-lg border border-brand-200 bg-white px-2.5 py-2 text-[12px] text-brand-600 outline-none cursor-pointer"
            aria-label="Antal föremål per sida"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} st
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
