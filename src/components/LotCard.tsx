"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import { Heart, Gavel, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { timeLeft, formatSEK, imgSize } from "@/lib/utils";
import type { Lot } from "@/lib/types";

interface LotCardProps {
  lot: Lot;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
  imagePriority?: boolean;
}

const TAP_SLOP_PX = 8;
const SWIPE_THRESHOLD_PX = 36;

export function LotCard({
  lot,
  isFavorite,
  onToggleFavorite,
  imagePriority = false,
}: LotCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [showLocationOverlay, setShowLocationOverlay] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchDeltaXRef = useRef(0);
  const touchDeltaYRef = useRef(0);
  const suppressClickRef = useRef(false);
  const tl = lot.endTime ? timeLeft(lot.endTime) : null;

  const images = lot.images?.length
    ? lot.images
    : lot.thumbnailUrl
      ? [lot.thumbnailUrl]
      : [];
  const currentImage = images[imgIndex]
    ? imgSize(images[imgIndex], "med")
    : undefined;
  const showCountryCode = Boolean(lot.country && lot.country !== "SE");
  const locationLabel = [lot.city, showCountryCode ? lot.country : undefined]
    .filter(Boolean)
    .join(", ");
  const mapQuery = [lot.city, lot.country, lot.houseName]
    .filter(Boolean)
    .join(", ");
  const googleMapsEmbedUrl = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=11&output=embed`
    : undefined;
  const googleMapsExternalUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : undefined;
  const primaryPriceLabel = lot.isActive
    ? "Aktuellt bud"
    : lot.currentBid != null
      ? "Sista bud"
      : lot.soldPrice != null
        ? "Slutpris"
        : "Bud";
  const primaryPriceValue = lot.isActive
    ? lot.currentBid
    : (lot.currentBid ?? lot.soldPrice);

  const prevImage = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setImgIndex((i) => (i > 0 ? i - 1 : images.length - 1));
    },
    [images.length],
  );

  const nextImage = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setImgIndex((i) => (i < images.length - 1 ? i + 1 : 0));
    },
    [images.length],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchDeltaXRef.current = 0;
    touchDeltaYRef.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartXRef.current == null || touchStartYRef.current == null) {
      return;
    }

    const touch = e.touches[0];
    touchDeltaXRef.current = touch.clientX - touchStartXRef.current;
    touchDeltaYRef.current = touch.clientY - touchStartYRef.current;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const deltaX = touchDeltaXRef.current;
    const deltaY = touchDeltaYRef.current;
    const isHorizontalGesture =
      Math.abs(deltaX) > TAP_SLOP_PX && Math.abs(deltaX) > Math.abs(deltaY);

    if (isHorizontalGesture) {
      suppressClickRef.current = true;

      if (images.length > 1 && Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) {
        setImgIndex((currentIndex) => {
          if (deltaX < 0) {
            return currentIndex < images.length - 1 ? currentIndex + 1 : 0;
          }

          return currentIndex > 0 ? currentIndex - 1 : images.length - 1;
        });
      }

      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchDeltaXRef.current = 0;
    touchDeltaYRef.current = 0;
  }, [images.length]);

  const handleMapButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (!locationLabel) {
        return;
      }

      const prefersTouch =
        typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches;

      if (prefersTouch && googleMapsExternalUrl) {
        window.open(googleMapsExternalUrl, "_blank", "noopener,noreferrer");
        return;
      }

      setShowLocationOverlay((current) => !current);
    },
    [googleMapsExternalUrl, locationLabel],
  );

  return (
    <a
      href={lot.url}
      target="_blank"
      rel="noopener noreferrer"
      onClickCapture={(e) => {
        if (!suppressClickRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        suppressClickRef.current = false;
      }}
      className={`group relative flex h-full flex-col overflow-visible rounded-xl border border-brand-200/60 bg-white shadow-card animate-slide-up cursor-pointer isolate
        transition-all duration-300 hover:-translate-y-[3px] hover:border-brand-300/60 hover:shadow-elevated ${
          showLocationOverlay ? "z-40" : "z-0 hover:z-10"
        }`}
    >
      {/* Image */}
      <div
        className="relative aspect-[4/3] overflow-hidden bg-brand-100"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => {
          setHovering(false);
          setImgIndex(0);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{ touchAction: "pan-y" }}
      >
        {/* Placeholder */}
        <div
          className="absolute inset-0 flex items-center justify-center text-brand-300 transition-opacity"
          style={{ opacity: imgLoaded ? 0 : 1 }}
        >
          <Gavel size={32} />
        </div>

        {/* Image */}
        {currentImage && (
          <Image
            src={currentImage}
            alt={lot.title}
            fill
            sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 1.5rem), (max-width: 1279px) calc(33vw - 1.5rem), 280px"
            priority={imagePriority}
            loading={imagePriority ? "eager" : "lazy"}
            fetchPriority={imagePriority ? "high" : "auto"}
            className="object-cover group-hover:scale-[1.04] transition-transform duration-500"
            style={{ opacity: imgLoaded ? 1 : 0 }}
            onLoad={() => setImgLoaded(true)}
          />
        )}

        {/* Navigation arrows — show on hover when multiple images */}
        {hovering && images.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7
                rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center
                text-brand-600 hover:bg-white shadow-sm transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7
                rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center
                text-brand-600 hover:bg-white shadow-sm transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* Dot indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {images.slice(0, 7).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === imgIndex ? "bg-white w-3" : "bg-white/50"
                }`}
              />
            ))}
            {images.length > 7 && (
              <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
            )}
          </div>
        )}

        {/* Favorite button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(lot.id);
          }}
          className={`absolute top-2.5 right-2.5 z-10 w-[34px] h-[34px]
            rounded-full flex items-center justify-center
            backdrop-blur-md transition-all hover:scale-110
            ${
              isFavorite
                ? "bg-accent-500/90 text-white"
                : "bg-white/90 text-brand-400 hover:text-accent-500"
            }`}
        >
          <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
        </button>

        {/* Time badge */}
        {tl && (
          <span
            className={`absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full
              text-[11px] font-medium text-white backdrop-blur-md
              ${tl.ended ? "bg-brand-900/50" : tl.urgent ? "bg-accent-500" : "bg-brand-900/70"}`}
          >
            {tl.text}
          </span>
        )}

        {/* Category chip */}
        {lot.categories?.[0] && (
          <span
            className="absolute top-2.5 left-2.5 bg-white/90 backdrop-blur-md
            px-2.5 py-0.5 rounded-full text-[11px] font-medium text-brand-600"
          >
            {lot.categories[0]}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="relative flex flex-1 flex-col p-4 pb-5 overflow-visible">
        <div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-brand-400 uppercase tracking-wider mb-1.5">
            {lot.houseLogoUrl && (
              <Image
                src={lot.houseLogoUrl}
                alt={lot.houseName ?? ""}
                width={16}
                height={16}
                className="rounded-sm object-contain shrink-0"
              />
            )}
            <span>{lot.houseName ?? "Auktionshus"}</span>
            {locationLabel && (
              <div
                className="relative"
                onMouseEnter={() => setShowLocationOverlay(true)}
                onMouseLeave={() => setShowLocationOverlay(false)}
              >
                <span>·</span>
                <button
                  type="button"
                  onClick={handleMapButtonClick}
                  className="ml-1 inline-flex min-h-8 items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold normal-case tracking-normal text-sky-700 transition-colors hover:bg-sky-100 hover:text-sky-900 sm:min-h-0 sm:px-2 sm:py-0.5"
                  aria-label={`Visa karta för ${locationLabel}`}
                >
                  <MapPin size={10} className="shrink-0" />
                  <span>{locationLabel}</span>
                </button>

                {showLocationOverlay && googleMapsEmbedUrl && (
                  <div
                    className="absolute left-0 top-[calc(100%-2px)] z-30 hidden w-[240px] overflow-hidden rounded-xl border border-sky-200 bg-sky-50/95 text-[11px] normal-case tracking-normal text-sky-900 shadow-lg backdrop-blur sm:block"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <div className="border-b border-sky-100 px-3 py-2">
                      <div className="font-semibold text-sky-950">
                        Finns i {locationLabel}
                      </div>
                      <div className="text-sky-800/80">
                        Snabbkarta för platsen.
                      </div>
                    </div>
                    <iframe
                      title={`Karta för ${locationLabel}`}
                      src={googleMapsEmbedUrl}
                      className="h-[138px] w-full border-0 bg-sky-100"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <h3 className="text-sm font-medium text-brand-900 leading-snug mb-1 line-clamp-2">
            {lot.title}
          </h3>

          {lot.description && (
            <p className="text-xs text-brand-400 leading-snug line-clamp-1 mb-3.5">
              {lot.description}
            </p>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between pt-3 border-t border-brand-100">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-400 mb-0.5">
              {primaryPriceLabel}
            </div>
            <div className="text-lg font-bold text-brand-900 tracking-tight">
              {formatSEK(primaryPriceValue)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-400 mb-0.5">
              Utrop
            </div>
            <div className="text-sm font-medium text-brand-400">
              {formatSEK(lot.estimate)}
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}
