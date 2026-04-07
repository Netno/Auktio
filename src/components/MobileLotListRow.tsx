"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Gavel, Heart, MapPin } from "lucide-react";
import { formatBidAmount, imgSize, timeLeft } from "@/lib/utils";
import type { Lot } from "@/lib/types";

interface MobileLotListRowProps {
  lot: Lot;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void | Promise<void>;
  onCategorySelect?: (category: string) => void;
  onHouseSelect?: (houseId: string) => void;
}

const SWIPE_THRESHOLD_PX = 28;

function getCountdownLabel(endTime?: string) {
  if (!endTime) {
    return null;
  }

  const countdown = timeLeft(endTime);

  return {
    text: countdown.text.replace(/\s*kvar$/u, ""),
    urgent: countdown.urgent,
    ended: countdown.ended,
  };
}

function getPrimaryAmount(lot: Lot) {
  if (lot.isActive) {
    return formatBidAmount(lot.currentBid, lot.currency);
  }

  if (lot.availability === "sold") {
    return formatBidAmount(lot.soldPrice ?? lot.currentBid, lot.currency);
  }

  if (lot.availability === "unsold") {
    return "Osåld";
  }

  return formatBidAmount(lot.currentBid ?? lot.soldPrice, lot.currency);
}

export function MobileLotListRow({
  lot,
  isFavorite,
  onToggleFavorite,
  onCategorySelect,
  onHouseSelect,
}: MobileLotListRowProps) {
  const images = lot.images?.length
    ? lot.images
    : lot.thumbnailUrl
      ? [lot.thumbnailUrl]
      : [];
  const [imageIndex, setImageIndex] = useState(0);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [hasOverflowingText, setHasOverflowingText] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);
  const imageSource = imgSize(images[imageIndex] ?? lot.thumbnailUrl, "sm");
  const countdownLabel = getCountdownLabel(lot.endTime);
  const categoryLabel = lot.categories?.[0] ?? lot.aiCategories?.[0] ?? null;
  const houseLabel = lot.houseName ?? null;
  const hasLocationHint = Boolean(lot.city || lot.country);
  const mapQuery = [lot.city, lot.country, lot.houseName]
    .filter(Boolean)
    .join(", ");
  const description = lot.description?.trim() ?? "";
  const showExpandTextToggle = hasOverflowingText || isTextExpanded;
  const badgeClass =
    "inline-flex min-h-6 items-center rounded-full px-2.5 text-[10px] font-semibold leading-none";

  useEffect(() => {
    if (isTextExpanded) {
      return;
    }

    const updateOverflowState = () => {
      const elements = [titleRef.current, descriptionRef.current].filter(
        (element): element is HTMLHeadingElement | HTMLParagraphElement =>
          element != null,
      );

      setHasOverflowingText(
        elements.some(
          (element) => element.scrollHeight - element.clientHeight > 1,
        ),
      );
    };

    updateOverflowState();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOverflowState);

      return () => {
        window.removeEventListener("resize", updateOverflowState);
      };
    }

    const observer = new ResizeObserver(() => {
      updateOverflowState();
    });

    if (titleRef.current) {
      observer.observe(titleRef.current);
    }

    if (descriptionRef.current) {
      observer.observe(descriptionRef.current);
    }

    return () => observer.disconnect();
  }, [description, isTextExpanded, lot.title]);

  return (
    <a
      href={lot.url}
      target="_blank"
      rel="noopener noreferrer"
      className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-[20px] border border-brand-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf8_100%)] p-3 shadow-[0_10px_24px_rgba(26,26,24,0.06)]"
    >
      <div
        className="relative h-[7.1rem] w-[5.5rem] shrink-0 overflow-hidden rounded-2xl bg-brand-100"
        onTouchStart={(event) => {
          touchStartXRef.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          if (touchStartXRef.current == null || images.length < 2) {
            touchStartXRef.current = null;
            return;
          }

          const deltaX =
            (event.changedTouches[0]?.clientX ?? 0) - touchStartXRef.current;

          if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) {
            setImageIndex((current) => {
              if (deltaX < 0) {
                return current < images.length - 1 ? current + 1 : 0;
              }

              return current > 0 ? current - 1 : images.length - 1;
            });
          }

          touchStartXRef.current = null;
        }}
      >
        {imageSource ? (
          <Image
            src={imageSource}
            alt={lot.title}
            fill
            sizes="96px"
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-brand-300">
            <Gavel size={24} />
          </div>
        )}

        {images.length > 1 ? (
          <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">
            {images.slice(0, 4).map((_, index) => (
              <span
                key={index}
                className={`h-1 rounded-full bg-white/85 ${
                  index === imageIndex ? "w-3" : "w-1"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative min-w-0 flex flex-col">
        <button
          type="button"
          aria-label={isFavorite ? "Ta bort bevakning" : "Bevaka objekt"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void onToggleFavorite(lot.id);
          }}
          className={`absolute right-0 top-0 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-[0_4px_12px_rgba(13,13,12,0.1)] transition-colors ${
            isFavorite
              ? "border-accent-300/28 bg-accent-500 text-white"
              : "border-brand-200/80 bg-white/95 text-brand-500 hover:border-brand-300 hover:bg-brand-50"
          }`}
        >
          <Heart size={15} fill={isFavorite ? "currentColor" : "none"} />
        </button>

        <div className="min-w-0 flex-1 pt-0.5">
          <h3
            ref={titleRef}
            className={`pr-10 text-[14px] font-medium leading-[1.3] text-brand-950 ${
              isTextExpanded ? "line-clamp-none" : "line-clamp-2"
            }`}
          >
            {lot.title}
          </h3>

          {description ? (
            <p
              ref={descriptionRef}
              className={`mt-1 text-[11px] leading-[1.45] text-brand-500 ${
                isTextExpanded ? "line-clamp-none" : "line-clamp-2"
              }`}
            >
              {description}
            </p>
          ) : null}

          {showExpandTextToggle ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsTextExpanded((current) => !current);
              }}
              className="mt-1 inline-flex appearance-none border-0 bg-transparent p-0 text-[10px] font-medium text-brand-400 shadow-none transition-colors hover:text-brand-600"
              aria-expanded={isTextExpanded}
            >
              {isTextExpanded ? "Visa mindre" : "Visa mer"}
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex items-end justify-between gap-3 border-t border-brand-100 pt-2.5">
          <div className="min-w-0">
            {houseLabel || (hasLocationHint && mapQuery) ? (
              <div className="flex max-w-full items-center gap-1.5">
                {houseLabel ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (lot.houseId) {
                        onHouseSelect?.(lot.houseId);
                      }
                    }}
                    className="min-w-0 truncate text-left text-[11px] font-medium text-brand-500 underline decoration-brand-300 underline-offset-2"
                  >
                    {houseLabel}
                  </button>
                ) : null}

                {hasLocationHint && mapQuery ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                    aria-label={`Visa karta för ${lot.city ?? lot.country ?? houseLabel ?? "plats"}`}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-500/80 transition-colors hover:bg-sky-100 hover:text-sky-600"
                  >
                    <MapPin size={10} strokeWidth={2} />
                  </button>
                ) : null}
              </div>
            ) : null}

            <span className="mt-1 inline-flex min-h-6 items-center whitespace-nowrap text-[15px] font-semibold leading-none text-brand-900">
              {getPrimaryAmount(lot)}
            </span>
          </div>

          <div className="grid shrink-0 self-end grid-cols-[5.5rem_3.75rem] items-end gap-2">
            {categoryLabel ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCategorySelect?.(categoryLabel);
                }}
                className={`${badgeClass} w-full justify-center truncate border border-brand-200 bg-white text-brand-600 transition-colors hover:border-brand-300 hover:bg-brand-50`}
              >
                <span className="truncate">{categoryLabel}</span>
              </button>
            ) : (
              <span className="min-h-6" aria-hidden="true" />
            )}

            {countdownLabel ? (
              <span
                className={`${badgeClass} w-full justify-center whitespace-nowrap text-white ${
                  countdownLabel.ended
                    ? "bg-brand-700"
                    : countdownLabel.urgent
                      ? "bg-accent-700"
                      : "bg-brand-900"
                }`}
              >
                {countdownLabel.text}
              </span>
            ) : (
              <span className="min-h-6" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
    </a>
  );
}
