"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import {
  Heart,
  Gavel,
  ChevronLeft,
  ChevronRight,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { timeLeft, formatSEK, imgSize } from "@/lib/utils";
import type { Lot } from "@/lib/types";

interface LotCardProps {
  lot: Lot;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
}

export function LotCard({ lot, isFavorite, onToggleFavorite }: LotCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [showLocationOverlay, setShowLocationOverlay] = useState(false);
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
  const googleMapsUrl = locationLabel
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [lot.city, lot.country, lot.houseName].filter(Boolean).join(", "),
      )}`
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

  return (
    <a
      href={lot.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group h-full flex flex-col bg-white rounded-xl border border-brand-200/60 shadow-card
        hover:shadow-elevated hover:-translate-y-[3px] hover:border-brand-300/60
        transition-all duration-300 overflow-hidden animate-slide-up cursor-pointer"
    >
      {/* Image */}
      <div
        className="relative aspect-[4/3] overflow-hidden bg-brand-100"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => {
          setHovering(false);
          setImgIndex(0);
        }}
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
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 25vw"
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
      <div className="p-4 pb-5 flex flex-1 flex-col">
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
              <div className="relative">
                <span>·</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowLocationOverlay((current) => !current);
                  }}
                  onMouseLeave={() => {
                    if (!showLocationOverlay) return;
                  }}
                  className="ml-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-sky-700 transition-colors hover:bg-sky-100 hover:text-sky-900"
                  aria-label={`Visa plats för ${lot.title}`}
                >
                  <MapPin size={10} className="shrink-0" />
                  <span>{locationLabel}</span>
                </button>

                {showLocationOverlay && googleMapsUrl && (
                  <div
                    className="absolute left-0 top-full z-20 mt-2 w-52 rounded-xl border border-sky-200 bg-sky-50/95 p-3 text-[11px] normal-case tracking-normal text-sky-900 shadow-lg backdrop-blur"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseLeave={() => setShowLocationOverlay(false)}
                  >
                    <div className="mb-1.5 font-semibold text-sky-950">
                      Finns i {locationLabel}
                    </div>
                    <div className="mb-3 text-sky-800/80">
                      Visa platsen direkt i Google Maps.
                    </div>
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-sky-700"
                    >
                      <ExternalLink size={12} />
                      <span>Öppna i Google Maps</span>
                    </a>
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
