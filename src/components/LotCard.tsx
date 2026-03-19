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
import {
  timeLeft,
  formatAmount,
  formatDateTimeStamp,
  imgSize,
} from "@/lib/utils";
import type { Lot } from "@/lib/types";

interface LotCardProps {
  lot: Lot;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
  imagePriority?: boolean;
}

const TAP_SLOP_PX = 8;
const SWIPE_THRESHOLD_PX = 36;
const MOBILE_ZOOM_MIN_SCALE = 1;
const MOBILE_ZOOM_MAX_SCALE = 4;
const MOBILE_ZOOM_STEP = 0.5;
const DOUBLE_TAP_DELAY_MS = 280;
const TALL_IMAGE_CONTAIN_THRESHOLD = 0.68;

function getCountryFlagSwatchStyle(countryCode: string) {
  switch (countryCode) {
    case "DK":
      return {
        background:
          "linear-gradient(90deg, #c60c30 0 30%, #ffffff 30% 38%, #c60c30 38% 100%), linear-gradient(180deg, transparent 0 43%, #ffffff 43% 57%, transparent 57% 100%), #c60c30",
      };
    case "NO":
      return {
        background:
          "linear-gradient(90deg, #ba0c2f 0 28%, #ffffff 28% 40%, #00205b 40% 48%, #ffffff 48% 60%, #ba0c2f 60% 100%), linear-gradient(180deg, transparent 0 41%, #ffffff 41% 59%, transparent 59% 100%), linear-gradient(180deg, transparent 0 45%, #00205b 45% 55%, transparent 55% 100%), #ba0c2f",
      };
    case "AT":
      return {
        background:
          "linear-gradient(180deg, #ed2939 0 33.33%, #ffffff 33.33% 66.66%, #ed2939 66.66% 100%)",
      };
    case "EE":
      return {
        background:
          "linear-gradient(180deg, #4891d9 0 33.33%, #1f1f1f 33.33% 66.66%, #ffffff 66.66% 100%)",
      };
    case "DE":
      return {
        background:
          "linear-gradient(180deg, #000000 0 33.33%, #dd0000 33.33% 66.66%, #ffce00 66.66% 100%)",
      };
    default:
      return {
        background: "linear-gradient(180deg, #d9e7f5 0 50%, #f7efe1 50% 100%)",
      };
  }
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTouchDistance(touches: React.TouchList) {
  if (touches.length < 2) {
    return 0;
  }

  const firstTouch = touches[0];
  const secondTouch = touches[1];
  const deltaX = secondTouch.clientX - firstTouch.clientX;
  const deltaY = secondTouch.clientY - firstTouch.clientY;

  return Math.hypot(deltaX, deltaY);
}

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
  const [imageVariantIndex, setImageVariantIndex] = useState(0);
  const [currentImageAspectRatio, setCurrentImageAspectRatio] = useState(1);
  const [currentImageFit, setCurrentImageFit] = useState<"cover" | "contain">(
    "cover",
  );
  const [hovering, setHovering] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [showLocationOverlay, setShowLocationOverlay] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showImagePreviewActive, setShowImagePreviewActive] = useState(false);
  const [showImageZoom, setShowImageZoom] = useState(false);
  const [mobileZoomScale, setMobileZoomScale] = useState(MOBILE_ZOOM_MIN_SCALE);
  const [mobileZoomOffset, setMobileZoomOffset] = useState({ x: 0, y: 0 });
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
  const mobileZoomImageAreaRef = useRef<HTMLDivElement | null>(null);
  const zoomButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileZoomLastTapRef = useRef(0);
  const mobileZoomPanStartRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const mobileZoomPinchStartRef = useRef<{
    distance: number;
    scale: number;
  } | null>(null);
  const tl = lot.endTime ? timeLeft(lot.endTime) : null;
  const shouldShowDescriptionTooltip = (lot.description?.length ?? 0) > 110;

  const images = lot.images?.length
    ? lot.images
    : lot.thumbnailUrl
      ? [lot.thumbnailUrl]
      : [];
  const imageSource = images[imgIndex];
  const currentImageCandidates = imageSource
    ? Array.from(
        new Set([imgSize(imageSource, "med"), imageSource].filter(Boolean)),
      )
    : [];
  const zoomImageCandidates = imageSource
    ? Array.from(
        new Set(
          [
            imgSize(imageSource, "lg"),
            imgSize(imageSource, "med"),
            imageSource,
          ].filter(Boolean),
        ),
      )
    : [];
  const currentImage = currentImageCandidates[imageVariantIndex];
  const zoomImage =
    zoomImageCandidates[
      Math.min(imageVariantIndex, zoomImageCandidates.length - 1)
    ] ?? zoomImageCandidates[0];
  const detailZoomImage = zoomImage ?? currentImage ?? imageSource;
  const magnifierImage = detailZoomImage;
  const MAGNIFIER_SIZE_PX = 220;
  const MAGNIFIER_ZOOM_PERCENT = 520;
  const showCountryCode = Boolean(lot.country && lot.country !== "SE");
  const countryCode = lot.country?.toUpperCase() ?? "";
  const showCountryBadge = Boolean(showCountryCode && countryCode);
  const locationLabel = [lot.city, showCountryCode ? lot.country : undefined]
    .filter(Boolean)
    .join(", ");
  const visibleLocationLabel =
    showCountryBadge && lot.city ? lot.city : locationLabel;
  const mapQuery = [lot.city, lot.country, lot.houseName]
    .filter(Boolean)
    .join(", ");
  const googleMapsEmbedUrl = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=11&output=embed`
    : undefined;
  const googleMapsExternalUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : undefined;
  const hasVerifiedSoldPrice =
    !lot.isActive && lot.availability === "sold" && lot.soldPrice != null;
  const hasEndedBid =
    !lot.isActive && !hasVerifiedSoldPrice && lot.currentBid != null;
  const endedAtLabel = !lot.isActive
    ? formatDateTimeStamp(lot.localEndTime ?? lot.endTime)
    : "";
  const primaryPriceLabel = lot.isActive
    ? "Aktuellt bud"
    : hasVerifiedSoldPrice
      ? "Slutpris"
      : hasEndedBid
        ? "Sista bud"
        : "Värdering";
  const primaryPriceValue = lot.isActive
    ? lot.currentBid
    : hasVerifiedSoldPrice
      ? lot.soldPrice
      : hasEndedBid
        ? lot.currentBid
        : lot.estimate;
  const showSoldPrice = hasVerifiedSoldPrice;
  const shouldShowEstimateColumn = lot.isActive;

  useEffect(() => {
    setImgLoaded(false);
    setImageVariantIndex(0);
    setCurrentImageAspectRatio(1);
    setCurrentImageFit("cover");
  }, [imageSource]);

  const isTallPortraitImage =
    currentImageFit === "contain" &&
    currentImageAspectRatio < TALL_IMAGE_CONTAIN_THRESHOLD;

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

  const clampMobileZoomOffset = useCallback(
    (nextScale: number, offset: { x: number; y: number }) => {
      const container = mobileZoomImageAreaRef.current;

      if (!container || nextScale <= MOBILE_ZOOM_MIN_SCALE) {
        return { x: 0, y: 0 };
      }

      const maxOffsetX =
        (container.clientWidth * nextScale - container.clientWidth) / 2;
      const maxOffsetY =
        (container.clientHeight * nextScale - container.clientHeight) / 2;

      return {
        x: clampValue(offset.x, -maxOffsetX, maxOffsetX),
        y: clampValue(offset.y, -maxOffsetY, maxOffsetY),
      };
    },
    [],
  );

  const updateMobileZoomScale = useCallback(
    (nextScale: number) => {
      const clampedScale = clampValue(
        nextScale,
        MOBILE_ZOOM_MIN_SCALE,
        MOBILE_ZOOM_MAX_SCALE,
      );

      setMobileZoomScale(clampedScale);
      setMobileZoomOffset((currentOffset) =>
        clampMobileZoomOffset(clampedScale, currentOffset),
      );
    },
    [clampMobileZoomOffset],
  );

  const handleMobileZoomIn = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      updateMobileZoomScale(mobileZoomScale + MOBILE_ZOOM_STEP);
    },
    [mobileZoomScale, updateMobileZoomScale],
  );

  const handleMobileZoomOut = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      updateMobileZoomScale(mobileZoomScale - MOBILE_ZOOM_STEP);
    },
    [mobileZoomScale, updateMobileZoomScale],
  );

  const handleMobileZoomTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        mobileZoomPinchStartRef.current = {
          distance: getTouchDistance(e.touches),
          scale: mobileZoomScale,
        };
        mobileZoomPanStartRef.current = null;
        return;
      }

      if (e.touches.length !== 1) {
        return;
      }

      const touch = e.touches[0];
      const now = Date.now();

      if (now - mobileZoomLastTapRef.current <= DOUBLE_TAP_DELAY_MS) {
        e.preventDefault();
        const nextScale = mobileZoomScale > MOBILE_ZOOM_MIN_SCALE ? 1 : 2.5;
        setMobileZoomOffset({ x: 0, y: 0 });
        updateMobileZoomScale(nextScale);
        mobileZoomLastTapRef.current = 0;
        mobileZoomPanStartRef.current = null;
        mobileZoomPinchStartRef.current = null;
        return;
      }

      mobileZoomLastTapRef.current = now;
      mobileZoomPanStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        offsetX: mobileZoomOffset.x,
        offsetY: mobileZoomOffset.y,
      };
    },
    [
      mobileZoomOffset.x,
      mobileZoomOffset.y,
      mobileZoomScale,
      updateMobileZoomScale,
    ],
  );

  const handleMobileZoomTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2 && mobileZoomPinchStartRef.current) {
        e.preventDefault();
        const nextDistance = getTouchDistance(e.touches);
        const pinchStart = mobileZoomPinchStartRef.current;

        if (!pinchStart.distance) {
          return;
        }

        const nextScale =
          pinchStart.scale * (nextDistance / pinchStart.distance);
        updateMobileZoomScale(nextScale);
        return;
      }

      if (
        e.touches.length === 1 &&
        mobileZoomPanStartRef.current &&
        mobileZoomScale > MOBILE_ZOOM_MIN_SCALE
      ) {
        e.preventDefault();

        const touch = e.touches[0];
        const panStart = mobileZoomPanStartRef.current;
        const rawOffset = {
          x: panStart.offsetX + (touch.clientX - panStart.x),
          y: panStart.offsetY + (touch.clientY - panStart.y),
        };

        setMobileZoomOffset(clampMobileZoomOffset(mobileZoomScale, rawOffset));
      }
    },
    [clampMobileZoomOffset, mobileZoomScale, updateMobileZoomScale],
  );

  const handleMobileZoomTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1 && mobileZoomScale > MOBILE_ZOOM_MIN_SCALE) {
        const touch = e.touches[0];
        mobileZoomPanStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          offsetX: mobileZoomOffset.x,
          offsetY: mobileZoomOffset.y,
        };
      } else if (e.touches.length === 0) {
        mobileZoomPanStartRef.current = null;
      }

      if (e.touches.length < 2) {
        mobileZoomPinchStartRef.current = null;
      }
    },
    [mobileZoomOffset.x, mobileZoomOffset.y, mobileZoomScale],
  );

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

    setMobileZoomScale(MOBILE_ZOOM_MIN_SCALE);
    setMobileZoomOffset({ x: 0, y: 0 });
    mobileZoomPanStartRef.current = null;
    mobileZoomPinchStartRef.current = null;
    mobileZoomLastTapRef.current = 0;

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
        className={`group relative flex h-full flex-col overflow-visible rounded-xl border border-brand-200 bg-white shadow-[0_10px_28px_rgba(93,69,40,0.08),0_1px_0_rgba(255,255,255,0.85)_inset] animate-slide-up cursor-pointer isolate
        transition-all duration-300 hover:-translate-y-[3px] hover:border-brand-300 hover:shadow-[0_18px_42px_rgba(93,69,40,0.14),0_1px_0_rgba(255,255,255,0.92)_inset] ${
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
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.99),rgba(255,255,255,0.97)_58%,rgba(248,248,248,0.98)_100%)]" />

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
              key={currentImage}
              src={currentImage}
              alt={lot.title}
              fill
              sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 1.5rem), (max-width: 1279px) calc(33vw - 1.5rem), 280px"
              priority={imagePriority}
              loading={imagePriority ? "eager" : "lazy"}
              fetchPriority={imagePriority ? "high" : "auto"}
              unoptimized
              className={`${
                currentImageFit === "contain"
                  ? isTallPortraitImage
                    ? "object-contain px-0 py-0 scale-[1.08] group-hover:scale-[1.1]"
                    : "object-contain p-1 group-hover:scale-[1.04]"
                  : "object-cover group-hover:scale-[1.04]"
              } transition-transform duration-500`}
              style={{ opacity: imgLoaded ? 1 : 0 }}
              onError={() => {
                setImgLoaded(false);
                setImageVariantIndex((currentIndex) => currentIndex + 1);
              }}
              onLoad={(event) => {
                const image = event.currentTarget;
                const aspectRatio =
                  image.naturalHeight > 0
                    ? image.naturalWidth / image.naturalHeight
                    : 1;
                setCurrentImageAspectRatio(aspectRatio);
                setCurrentImageFit(
                  aspectRatio < TALL_IMAGE_CONTAIN_THRESHOLD
                    ? "contain"
                    : "cover",
                );
                setImgLoaded(true);
              }}
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
          {lot.isActive && tl && (
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
            <div className="mb-1.5 space-y-1.5 min-[520px]:space-y-0 min-[520px]:flex min-[520px]:items-start min-[520px]:justify-between min-[520px]:gap-3">
              <div className="min-w-0 flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.11em] text-brand-400 min-[520px]:flex-1 min-[520px]:pr-2">
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
                <span className="min-w-0 leading-snug">
                  {lot.houseName ?? "Auktionshus"}
                </span>
              </div>

              <div className="space-y-1.5 min-[520px]:flex min-[520px]:shrink-0 min-[520px]:items-center min-[520px]:gap-2 min-[520px]:space-y-0">
                {showCountryBadge && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600">
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-[18px] shrink-0 rounded-[4px] border border-white/70 shadow-[inset_0_0_0_0.5px_rgba(58,42,20,0.08)]"
                      style={getCountryFlagSwatchStyle(countryCode)}
                    />
                    <span>{lot.currency}</span>
                  </span>
                )}

                {locationLabel && (
                  <div
                    className="relative"
                    onMouseEnter={() => setShowLocationOverlay(true)}
                    onMouseLeave={() => setShowLocationOverlay(false)}
                  >
                    <button
                      type="button"
                      onClick={handleMapButtonClick}
                      className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold normal-case tracking-normal text-sky-700 transition-colors hover:bg-sky-100 hover:text-sky-900 sm:min-h-0 sm:px-2.5 sm:py-1"
                      aria-label={`Visa karta för ${locationLabel}`}
                    >
                      <MapPin size={10} className="shrink-0" />
                      <span>{visibleLocationLabel}</span>
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
            </div>

            <h3 className="text-sm font-medium text-brand-900 leading-snug mb-1 line-clamp-2">
              {lot.title}
            </h3>

            {lot.description && (
              <div className="relative mb-2">
                <p
                  className={`peer text-xs text-brand-400 leading-snug ${
                    isDescriptionExpanded ? "line-clamp-none" : "line-clamp-2"
                  }`}
                  tabIndex={shouldShowDescriptionTooltip ? 0 : -1}
                >
                  {lot.description}
                </p>

                {shouldShowDescriptionTooltip && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDescriptionExpanded((current) => !current);
                    }}
                    className="mt-1 inline-flex text-[11px] font-semibold text-brand-600 transition-colors hover:text-brand-900 sm:hidden"
                    aria-expanded={isDescriptionExpanded}
                  >
                    {isDescriptionExpanded ? "Visa mindre" : "Visa mer"}
                  </button>
                )}

                {shouldShowDescriptionTooltip && (
                  <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[280px] rounded-xl border border-brand-300 bg-[rgba(255,251,245,0.99)] px-3 py-2 text-[12px] leading-relaxed text-brand-800 shadow-[0_18px_36px_rgba(58,42,20,0.18)] ring-1 ring-white/85 opacity-0 translate-y-1 transition-all duration-150 sm:block peer-hover:translate-y-0 peer-hover:opacity-100 peer-focus:translate-y-0 peer-focus:opacity-100">
                    {lot.description}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-auto">
            {!lot.isActive && endedAtLabel && (
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-brand-500">
                <Gavel size={12} className="shrink-0 text-brand-400" />
                <span>Avslutad {endedAtLabel}</span>
              </div>
            )}

            <div className="flex items-end justify-between border-t border-brand-100 pt-3">
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
                  {formatAmount(primaryPriceValue, lot.currency)}
                </div>
              </div>
              {shouldShowEstimateColumn && (
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-400 mb-0.5">
                    Utrop
                  </div>
                  <div className="text-sm font-medium text-brand-400">
                    {formatAmount(lot.estimate, lot.currency)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </a>

      {showImageZoom && zoomImage && (
        <div
          className="fixed inset-0 z-[120] overflow-hidden bg-[linear-gradient(180deg,rgba(249,247,242,0.98)_0%,rgba(236,244,247,0.96)_52%,rgba(248,244,236,0.98)_100%)] backdrop-blur-md"
          onClick={handleCloseImageZoom}
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-[-8%] top-[-4%] h-56 w-56 rounded-full bg-[rgba(216,178,107,0.18)] blur-3xl" />
            <div className="absolute right-[-10%] top-[12%] h-72 w-72 rounded-full bg-[rgba(139,181,196,0.2)] blur-3xl" />
            <div className="absolute bottom-[-10%] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[rgba(185,157,117,0.14)] blur-3xl" />
          </div>

          <div
            className="relative flex h-full w-full items-stretch justify-center md:items-center md:px-4 md:py-6"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <button
              type="button"
              onClick={handleCloseImageZoom}
              className="absolute right-3 top-3 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/78 text-brand-900 shadow-card backdrop-blur-md transition-colors hover:bg-white"
              aria-label="Stäng bildzoom"
            >
              <X size={18} />
            </button>

            <div className="flex h-full w-full flex-col md:h-auto md:w-full md:max-w-5xl">
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prevImage}
                    className="absolute left-3 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/80 text-brand-900 shadow-card backdrop-blur-md transition-colors hover:bg-white"
                    aria-label="Visa föregående bild"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={nextImage}
                    className="absolute right-3 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/80 text-brand-900 shadow-card backdrop-blur-md transition-colors hover:bg-white"
                    aria-label="Visa nästa bild"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              <div className="flex flex-1 flex-col md:overflow-hidden md:rounded-[2rem] md:border md:border-white/60 md:bg-white/72 md:shadow-elevated-lg md:backdrop-blur-xl">
                <div
                  ref={mobileZoomImageAreaRef}
                  className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.98),rgba(241,236,227,0.92)_68%,rgba(228,235,238,0.92)_100%)] md:aspect-[4/3] md:h-auto md:flex-none"
                  onTouchStart={handleMobileZoomTouchStart}
                  onTouchMove={handleMobileZoomTouchMove}
                  onTouchEnd={handleMobileZoomTouchEnd}
                  onTouchCancel={handleMobileZoomTouchEnd}
                  style={{ touchAction: "none" }}
                >
                  <div className="pointer-events-none absolute inset-x-3 top-3 bottom-3 rounded-[1.75rem] border border-black/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.28))] shadow-[0_24px_60px_rgba(125,101,63,0.16)] md:hidden" />
                  <div className="pointer-events-none absolute inset-y-6 left-0 w-20 bg-gradient-to-r from-[rgba(255,255,255,0.68)] via-[rgba(255,255,255,0.2)] to-transparent md:hidden" />
                  <div className="pointer-events-none absolute inset-y-6 right-0 w-20 bg-gradient-to-l from-[rgba(255,255,255,0.68)] via-[rgba(255,255,255,0.2)] to-transparent md:hidden" />
                  {images.length > 1 && (
                    <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-white/80 bg-white/88 px-3 py-1 text-[11px] font-semibold text-brand-800 shadow-sm backdrop-blur-md md:hidden">
                      Svep mellan bilder
                    </div>
                  )}

                  <div
                    className="absolute inset-3 overflow-hidden rounded-[1.6rem] border border-black/10 bg-white/72 shadow-[0_10px_30px_rgba(92,73,42,0.14)] md:inset-0 md:rounded-none md:border-0 md:bg-transparent md:shadow-none"
                    style={{
                      transform: `translate3d(${mobileZoomOffset.x}px, ${mobileZoomOffset.y}px, 0) scale(${mobileZoomScale})`,
                      transformOrigin: "center center",
                    }}
                  >
                    <Image
                      src={zoomImage}
                      alt={lot.title}
                      fill
                      unoptimized
                      sizes="100vw"
                      className="object-contain"
                    />
                  </div>

                  <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/80 bg-white/88 px-3 py-1 text-[11px] font-semibold text-brand-800 shadow-sm backdrop-blur-md md:hidden">
                    Nyp för att zooma, dra för att flytta
                  </div>
                </div>

                <div className="border-t border-black/10 bg-white/92 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(82,62,30,0.06)] backdrop-blur-xl md:hidden">
                  <div className="flex items-center justify-center gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={handleMobileZoomOut}
                      className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-900 shadow-sm transition-colors hover:bg-brand-50 disabled:opacity-50"
                      aria-label="Zooma ut bild"
                      disabled={mobileZoomScale <= MOBILE_ZOOM_MIN_SCALE}
                    >
                      -
                    </button>
                    <div className="min-w-[4.5rem] text-center text-xs font-semibold tracking-wide text-brand-700">
                      {Math.round(mobileZoomScale * 100)}%
                    </div>
                    <button
                      type="button"
                      onClick={handleMobileZoomIn}
                      className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-900 shadow-sm transition-colors hover:bg-brand-50 disabled:opacity-50"
                      aria-label="Zooma in bild"
                      disabled={mobileZoomScale >= MOBILE_ZOOM_MAX_SCALE}
                    >
                      +
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-3 border-t border-brand-100 px-4 pt-3 text-brand-800">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold leading-tight text-brand-950">
                        {lot.title}
                      </p>
                      <p className="mt-1 truncate text-[12px] font-medium text-brand-600">
                        {lot.houseName ?? "Auktionshus"}
                      </p>
                    </div>
                    {images.length > 1 && (
                      <p className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                        Bild {imgIndex + 1} av {images.length}
                      </p>
                    )}
                  </div>
                </div>

                <div className="hidden items-center justify-between gap-3 border-t border-black/10 bg-white/82 px-4 py-3 text-brand-800 backdrop-blur-xl md:flex">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-brand-950">
                      {lot.title}
                    </p>
                    <p className="truncate text-xs font-medium text-brand-600">
                      {lot.houseName ?? "Auktionshus"}
                    </p>
                  </div>
                  {images.length > 1 && (
                    <p className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                      Bild {imgIndex + 1} av {images.length}
                    </p>
                  )}
                </div>
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
