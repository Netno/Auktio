"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Heart,
  Gavel,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  X,
} from "lucide-react";
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
  const PREVIEW_WIDTH_PX = 720;
  const PREVIEW_MIN_WIDTH_PX = 420;
  const PREVIEW_GAP_PX = 18;
  const PREVIEW_MARGIN_PX = 24;
  const PREVIEW_ASPECT_RATIO = 4 / 3;
  const [imgLoaded, setImgLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [showLocationOverlay, setShowLocationOverlay] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showImagePreviewActive, setShowImagePreviewActive] = useState(false);
  const [showImageZoom, setShowImageZoom] = useState(false);
  const [imagePreviewLayout, setImagePreviewLayout] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [previewFocus, setPreviewFocus] = useState<{
    xPx: number;
    yPx: number;
    xPercent: number;
    yPercent: number;
    visible: boolean;
  }>({
    xPx: 0,
    yPx: 0,
    xPercent: 50,
    yPercent: 50,
    visible: false,
  });
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchDeltaXRef = useRef(0);
  const touchDeltaYRef = useRef(0);
  const suppressClickRef = useRef(false);
  const previewCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const previewActivateTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const previewImageAreaRef = useRef<HTMLDivElement | null>(null);
  const zoomButtonRef = useRef<HTMLButtonElement | null>(null);
  const tl = lot.endTime ? timeLeft(lot.endTime) : null;

  const images = lot.images?.length
    ? lot.images
    : lot.thumbnailUrl
      ? [lot.thumbnailUrl]
      : [];
  const currentImage = images[imgIndex]
    ? imgSize(images[imgIndex], "med")
    : undefined;
  const zoomImage = images[imgIndex]
    ? imgSize(images[imgIndex], "lg")
    : undefined;
  const detailZoomImage = zoomImage ?? images[imgIndex];
  const magnifierImage = images[imgIndex] ?? zoomImage;
  const MAGNIFIER_SIZE_PX = 220;
  const MAGNIFIER_ZOOM_PERCENT = 520;
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
    : lot.availability === "sold"
      ? "Slutpris"
      : lot.soldPrice != null
        ? "Slutpris"
        : lot.currentBid != null
          ? "Sista bud"
          : lot.soldPrice != null
            ? "Slutpris"
            : "Bud";
  const primaryPriceValue = lot.isActive
    ? lot.currentBid
    : lot.availability === "sold"
      ? (lot.currentBid ?? lot.soldPrice)
      : (lot.soldPrice ?? lot.currentBid);
  const showSoldPrice = !lot.isActive && lot.availability === "sold";

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

  const handleOpenImageZoom = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (!zoomImage) {
        return;
      }

      const prefersTouch =
        typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches;

      if (!prefersTouch) {
        return;
      }

      setShowImageZoom(true);
    },
    [zoomImage],
  );

  const handleCloseImageZoom = useCallback(() => {
    setShowImageZoom(false);
  }, []);

  const clearPreviewCloseTimeout = useCallback(() => {
    if (previewCloseTimeoutRef.current) {
      clearTimeout(previewCloseTimeoutRef.current);
      previewCloseTimeoutRef.current = null;
    }
  }, []);

  const clearPreviewActivateTimeout = useCallback(() => {
    if (previewActivateTimeoutRef.current) {
      clearTimeout(previewActivateTimeoutRef.current);
      previewActivateTimeoutRef.current = null;
    }
    if (previewFrameRef.current != null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
  }, []);

  const updateImagePreviewLayout = useCallback(() => {
    if (typeof window === "undefined" || !zoomButtonRef.current) {
      return;
    }

    const rect = zoomButtonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.max(
      PREVIEW_MIN_WIDTH_PX,
      Math.min(PREVIEW_WIDTH_PX, viewportWidth - PREVIEW_MARGIN_PX * 2),
    );
    const height = width / PREVIEW_ASPECT_RATIO;
    const shouldOpenToRight = rect.left < viewportWidth / 2;

    let left = shouldOpenToRight
      ? rect.right + PREVIEW_GAP_PX
      : rect.left - width - PREVIEW_GAP_PX;
    let top = rect.top + rect.height / 2 - height / 2;

    left = Math.min(
      Math.max(left, PREVIEW_MARGIN_PX),
      viewportWidth - PREVIEW_MARGIN_PX - width,
    );
    top = Math.min(
      Math.max(top, PREVIEW_MARGIN_PX),
      viewportHeight - PREVIEW_MARGIN_PX - height,
    );

    setImagePreviewLayout({ top, left, width });
  }, []);

  const openImagePreview = useCallback(() => {
    if (!zoomImage) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches
    ) {
      return;
    }

    clearPreviewCloseTimeout();
    updateImagePreviewLayout();
    setShowImagePreview(true);
    clearPreviewActivateTimeout();
    previewFrameRef.current = requestAnimationFrame(() => {
      setShowImagePreviewActive(true);
      previewFrameRef.current = null;
    });
  }, [
    clearPreviewActivateTimeout,
    clearPreviewCloseTimeout,
    updateImagePreviewLayout,
    zoomImage,
  ]);

  const closeImagePreview = useCallback(() => {
    clearPreviewCloseTimeout();
    clearPreviewActivateTimeout();
    setShowImagePreviewActive(false);
    setPreviewFocus((current) => ({ ...current, visible: false }));
    previewCloseTimeoutRef.current = setTimeout(() => {
      setShowImagePreview(false);
      previewCloseTimeoutRef.current = null;
    }, 650);
  }, [clearPreviewActivateTimeout, clearPreviewCloseTimeout]);

  const handlePreviewPointerMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = previewImageAreaRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);

      setPreviewFocus({
        xPx: x,
        yPx: y,
        xPercent: rect.width ? (x / rect.width) * 100 : 50,
        yPercent: rect.height ? (y / rect.height) * 100 : 50,
        visible: true,
      });
    },
    [],
  );

  const handlePreviewPointerLeave = useCallback(() => {
    setPreviewFocus((current) => ({ ...current, visible: false }));
    closeImagePreview();
  }, [closeImagePreview]);

  useEffect(() => {
    if (!showImageZoom) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowImageZoom(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showImageZoom]);

  useEffect(() => {
    return () => {
      if (previewCloseTimeoutRef.current) {
        clearTimeout(previewCloseTimeoutRef.current);
      }
      if (previewActivateTimeoutRef.current) {
        clearTimeout(previewActivateTimeoutRef.current);
      }
      if (previewFrameRef.current != null) {
        cancelAnimationFrame(previewFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showImagePreview) {
      return;
    }

    const handleWindowChange = () => {
      updateImagePreviewLayout();
    };

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [showImagePreview, updateImagePreviewLayout]);

  return (
    <>
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
          showLocationOverlay || showImageZoom ? "z-40" : "z-0 hover:z-10"
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
              unoptimized
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

          {zoomImage && (
            <button
              ref={zoomButtonRef}
              type="button"
              onClick={handleOpenImageZoom}
              onMouseEnter={openImagePreview}
              onMouseLeave={closeImagePreview}
              onFocus={openImagePreview}
              onBlur={closeImagePreview}
              className="absolute bottom-2.5 left-2.5 z-10 inline-flex min-h-8 items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-brand-700 backdrop-blur-md transition-colors hover:bg-white hover:text-brand-900"
              aria-label={`Zooma bild för ${lot.title}`}
            >
              <Search size={12} />
              <span>Zooma</span>
            </button>
          )}

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
                  unoptimized
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
              <div
                className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${
                  showSoldPrice ? "text-emerald-600" : "text-brand-400"
                }`}
              >
                {primaryPriceLabel}
              </div>
              <div
                className={`text-lg font-bold tracking-tight ${
                  showSoldPrice ? "text-emerald-700" : "text-brand-900"
                }`}
              >
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

      {showImageZoom && zoomImage && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-brand-950/88 px-4 py-6 backdrop-blur-sm"
          onClick={handleCloseImageZoom}
        >
          <div
            className="relative w-full max-w-5xl"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <button
              type="button"
              onClick={handleCloseImageZoom}
              className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/92 text-brand-800 shadow-card transition-colors hover:bg-white"
              aria-label="Stäng bildzoom"
            >
              <X size={18} />
            </button>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevImage}
                  className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-brand-800 shadow-card transition-colors hover:bg-white"
                  aria-label="Visa föregående bild"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-brand-800 shadow-card transition-colors hover:bg-white"
                  aria-label="Visa nästa bild"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-brand-900 shadow-elevated-lg">
              <div className="relative aspect-[4/3] w-full bg-brand-950">
                <Image
                  src={zoomImage}
                  alt={lot.title}
                  fill
                  unoptimized
                  sizes="100vw"
                  className="object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-white/90">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {lot.title}
                  </p>
                  <p className="truncate text-xs text-white/65">
                    {lot.houseName ?? "Auktionshus"}
                  </p>
                </div>
                {images.length > 1 && (
                  <p className="shrink-0 text-xs font-medium text-white/65">
                    Bild {imgIndex + 1} av {images.length}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showImagePreview && zoomImage && imagePreviewLayout && (
        <div className="pointer-events-none fixed inset-0 z-[110] hidden md:block">
          <div
            className={`pointer-events-auto fixed transition-all duration-200 ease-out ${
              showImagePreviewActive
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-2 scale-[0.985] opacity-0"
            }`}
            style={{
              top: `${imagePreviewLayout.top}px`,
              left: `${imagePreviewLayout.left}px`,
              width: `${imagePreviewLayout.width}px`,
            }}
            onMouseEnter={openImagePreview}
            onMouseLeave={handlePreviewPointerLeave}
          >
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevImage}
                  className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/96 text-brand-800 shadow-card transition-colors hover:bg-white"
                  aria-label="Visa föregående bild"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/96 text-brand-800 shadow-card transition-colors hover:bg-white"
                  aria-label="Visa nästa bild"
                >
                  <ChevronRight size={22} />
                </button>
              </>
            )}

            <div
              ref={previewImageAreaRef}
              className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white shadow-elevated-lg ring-1 ring-black/5"
              onMouseMove={handlePreviewPointerMove}
            >
              <Image
                src={zoomImage}
                alt={lot.title}
                fill
                unoptimized
                sizes="(max-width: 1023px) 70vw, 720px"
                className="object-contain"
              />
            </div>

            {previewFocus.visible && detailZoomImage && (
              <div
                className="pointer-events-none absolute overflow-hidden rounded-2xl border border-white/90 bg-white/98 shadow-elevated-lg backdrop-blur-sm transition-transform duration-75"
                style={{
                  width: `${MAGNIFIER_SIZE_PX}px`,
                  height: `${MAGNIFIER_SIZE_PX}px`,
                  left: `${Math.min(
                    Math.max(
                      previewFocus.xPx - MAGNIFIER_SIZE_PX / 2,
                      -MAGNIFIER_SIZE_PX * 0.22,
                    ),
                    (previewImageAreaRef.current?.clientWidth ?? 0) -
                      MAGNIFIER_SIZE_PX * 0.78,
                  )}px`,
                  top: `${Math.min(
                    Math.max(
                      previewFocus.yPx - MAGNIFIER_SIZE_PX / 2,
                      -MAGNIFIER_SIZE_PX * 0.22,
                    ),
                    (previewImageAreaRef.current?.clientHeight ?? 0) -
                      MAGNIFIER_SIZE_PX * 0.78,
                  )}px`,
                }}
              >
                <div
                  className="h-full w-full bg-no-repeat"
                  style={{
                    backgroundImage: `url(${detailZoomImage})`,
                    backgroundPosition: `${previewFocus.xPercent}% ${previewFocus.yPercent}%`,
                    backgroundSize: `${MAGNIFIER_ZOOM_PERCENT}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
