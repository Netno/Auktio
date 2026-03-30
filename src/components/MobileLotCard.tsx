"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Gavel,
  Heart,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { formatBidAmount, imgSize, timeLeft } from "@/lib/utils";
import type { Lot } from "@/lib/types";

interface MobileLotCardProps {
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

function getPriceLabel(lot: Lot) {
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

function getEyebrowLabel(lot: Lot) {
  return lot.categories?.[0] ?? lot.aiCategories?.[0] ?? lot.houseName ?? null;
}

export function MobileLotCard({
  lot,
  isFavorite,
  onToggleFavorite,
  onCategorySelect,
  onHouseSelect,
}: MobileLotCardProps) {
  const images = lot.images?.length
    ? lot.images
    : lot.thumbnailUrl
      ? [lot.thumbnailUrl]
      : [];
  const [imageIndex, setImageIndex] = useState(0);
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [hasOverflowingText, setHasOverflowingText] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);
  const imageSource = imgSize(images[imageIndex] ?? lot.thumbnailUrl, "sm");
  const zoomImageSource =
    imgSize(images[imageIndex] ?? lot.thumbnailUrl, "lg") ??
    images[imageIndex] ??
    lot.thumbnailUrl;
  const countdownLabel = getCountdownLabel(lot.endTime);
  const categoryLabel = lot.categories?.[0] ?? lot.aiCategories?.[0] ?? null;
  const houseLabel = lot.houseName ?? null;
  const hasLocationHint = Boolean(lot.city || lot.country);
  const mapQuery = [lot.city, lot.country, lot.houseName].filter(Boolean).join(", ");
  const eyebrowLabel = categoryLabel ?? houseLabel;
  const secondaryLabel =
    houseLabel && houseLabel !== eyebrowLabel ? houseLabel : null;
  const description = lot.description?.trim() ?? "";
  const showExpandTextToggle = hasOverflowingText || isTextExpanded;

  const showNextImage = () => {
    setImageIndex((current) => (current < images.length - 1 ? current + 1 : 0));
  };

  const showPreviousImage = () => {
    setImageIndex((current) => (current > 0 ? current - 1 : images.length - 1));
  };

  const handleImageTouchEnd = (clientX: number) => {
    if (touchStartXRef.current == null || images.length < 2) {
      touchStartXRef.current = null;
      return;
    }

    const deltaX = clientX - touchStartXRef.current;

    if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) {
      if (deltaX < 0) {
        showNextImage();
      } else {
        showPreviousImage();
      }
    }

    touchStartXRef.current = null;
  };

  useEffect(() => {
    if (!isImageZoomOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isImageZoomOpen]);

  useEffect(() => {
    if (isTextExpanded) {
      return;
    }

    const updateOverflowState = () => {
      const elements = [titleRef.current, descriptionRef.current].filter(
        (
          element,
        ): element is HTMLHeadingElement | HTMLParagraphElement =>
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
    <>
      <a
        href={lot.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-h-[18.9rem] flex-col overflow-hidden rounded-lg border border-brand-200/80 bg-white shadow-[0_8px_20px_rgba(26,26,24,0.06)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
      >
        <div
          className="relative aspect-square overflow-hidden bg-[linear-gradient(180deg,#f5f0eb_0%,#efe6dd_100%)]"
          onTouchStart={(event) => {
            touchStartXRef.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            handleImageTouchEnd(event.changedTouches[0]?.clientX ?? 0);
          }}
        >
          {imageSource ? (
            <Image
              src={imageSource}
              alt={lot.title}
              fill
              sizes="(max-width: 639px) 50vw, 240px"
              unoptimized
              className="object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(245,240,235,0.92))] px-4 text-brand-300">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-brand-200 bg-white/80 shadow-sm">
                <Gavel size={24} />
              </span>
              <span className="mt-3 text-[11px] font-medium text-brand-500">
                Bild saknas
              </span>
            </div>
          )}

          <button
            type="button"
            aria-label={isFavorite ? "Ta bort bevakning" : "Bevaka objekt"}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onToggleFavorite(lot.id);
            }}
            className={`absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-[0_8px_18px_rgba(13,13,12,0.28)] backdrop-blur-md transition-colors ${
              isFavorite
                ? "border-accent-300/28 bg-accent-600/97 text-white"
                : "border-white/18 bg-brand-800/92 text-white hover:bg-brand-800/96"
            }`}
          >
            <Heart size={15} fill={isFavorite ? "currentColor" : "none"} />
          </button>

          {zoomImageSource || countdownLabel ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-brand-900/80 via-brand-900/34 to-transparent" />
              <div className="absolute inset-x-2.5 bottom-5 flex items-center justify-between gap-2">
                {zoomImageSource ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsImageZoomOpen(true);
                    }}
                    aria-label={`Förstora bild för ${lot.title}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/16 bg-brand-800/87 text-white shadow-[0_6px_14px_rgba(13,13,12,0.24)] backdrop-blur-md transition-colors hover:bg-brand-800/92"
                  >
                    <Search size={12} />
                  </button>
                ) : (
                  <span />
                )}

                {countdownLabel ? (
                  <span
                    className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_6px_14px_rgba(13,13,12,0.24)] backdrop-blur-md ${
                      countdownLabel.ended
                        ? "border-white/16 bg-brand-800/87"
                        : countdownLabel.urgent
                          ? "border-accent-300/28 bg-accent-600/97"
                          : "border-white/16 bg-brand-800/87"
                    }`}
                  >
                    {countdownLabel.text}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}

          {images.length > 1 ? (
            <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">
              {images.slice(0, 5).map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full shadow-[0_1px_4px_rgba(13,13,12,0.32)] ${
                    index === imageIndex
                      ? "w-3.5 bg-white"
                      : "w-1.5 bg-white/82"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#fbf8f6_100%)] p-3 pb-4">
          {eyebrowLabel ? (
            <div className="mb-2.5 flex items-center gap-2">
              {categoryLabel ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onCategorySelect?.(categoryLabel);
                  }}
                  className="max-w-full truncate rounded-full bg-brand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-700 transition-colors hover:bg-brand-200"
                >
                  {categoryLabel}
                </button>
              ) : houseLabel ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (lot.houseId) {
                      onHouseSelect?.(lot.houseId);
                    }
                  }}
                  className="max-w-full truncate rounded-full bg-brand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-700 transition-colors hover:bg-brand-200"
                >
                  {houseLabel}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <h3
              ref={titleRef}
              className={`${
                isTextExpanded ? "line-clamp-none" : "line-clamp-2"
              } pr-1 pb-0.5 text-[13px] font-medium leading-[1.45] text-brand-950`}
            >
              {lot.title}
            </h3>

            {description ? (
              <p
                ref={descriptionRef}
                className={`text-[11px] leading-[1.45] text-brand-500 ${
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
                className="inline-flex self-start text-[10px] font-medium text-brand-400 transition-colors hover:text-brand-600"
                aria-expanded={isTextExpanded}
              >
                {isTextExpanded ? "Visa mindre" : "Visa mer"}
              </button>
            ) : null}
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-2">
            <div className="min-h-[1rem]">
              {secondaryLabel || (hasLocationHint && mapQuery) ? (
                <div className="flex max-w-full items-center gap-1.5">
                  {secondaryLabel ? (
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
                      {secondaryLabel}
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
                      aria-label={`Visa karta för ${lot.city ?? lot.country ?? secondaryLabel ?? houseLabel ?? "plats"}`}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-500/80 transition-colors hover:bg-sky-100 hover:text-sky-600"
                    >
                      <MapPin size={10} strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex items-end justify-between gap-2">
              <p className="text-[15px] font-semibold text-brand-900">
                {getPriceLabel(lot)}
              </p>

              {lot.isActive ? (
                <span className="rounded-full bg-accent-50 px-2 py-1 text-[10px] font-semibold text-accent-700">
                  Aktiv
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </a>

      {isImageZoomOpen ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-brand-950/88 p-3 sm:hidden">
          <button
            type="button"
            aria-label="Stäng bildförstoring"
            className="absolute inset-0"
            onClick={() => setIsImageZoomOpen(false)}
          />

          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[24px] border border-white/10 bg-brand-950 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <div
              className="relative aspect-square bg-brand-900"
              onTouchStart={(event) => {
                touchStartXRef.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                handleImageTouchEnd(event.changedTouches[0]?.clientX ?? 0);
              }}
            >
              {zoomImageSource ? (
                <Image
                  src={zoomImageSource}
                  alt={lot.title}
                  fill
                  sizes="100vw"
                  unoptimized
                  className="object-contain"
                />
              ) : null}

              <button
                type="button"
                onClick={() => setIsImageZoomOpen(false)}
                aria-label="Stäng"
                className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/92 text-brand-900 shadow-lg"
              >
                <X size={18} />
              </button>

              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={showPreviousImage}
                    aria-label="Föregående bild"
                    className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-brand-900 shadow-lg"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={showNextImage}
                    aria-label="Nästa bild"
                    className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-brand-900 shadow-lg"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
                    {images.slice(0, 7).map((_, index) => (
                      <span
                        key={index}
                        className={`h-1.5 rounded-full ${
                          index === imageIndex
                            ? "w-4 bg-white"
                            : "w-1.5 bg-white/45"
                        }`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div className="border-t border-white/10 bg-brand-950 px-4 py-3 text-white">
              <p className="line-clamp-2 text-sm font-medium leading-snug">
                {lot.title}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
