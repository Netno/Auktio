const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

/**
 * Calculate human-readable time remaining until auction end.
 */
export function timeLeft(endTime: string): {
  text: string;
  urgent: boolean;
  ended: boolean;
} {
  const diff = new Date(endTime).getTime() - Date.now();

  if (diff < 0) return { text: "Avslutad", urgent: false, ended: true };

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);

  if (days > 0) {
    return { text: `${days}d ${hours}h kvar`, urgent: days < 1, ended: false };
  }
  if (hours > 0) {
    return {
      text: `${hours}h ${minutes}m kvar`,
      urgent: hours < 3,
      ended: false,
    };
  }
  return { text: `${minutes}m kvar`, urgent: true, ended: false };
}

/**
 * Format a number as Swedish currency.
 */
export function formatSEK(amount: number | null | undefined): string {
  if (amount == null) return "–";
  return amount.toLocaleString("sv-SE") + " kr";
}

export function formatAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null) return "–";

  const resolvedCurrency = currency?.toUpperCase() || "SEK";
  if (resolvedCurrency === "SEK") {
    return formatSEK(amount);
  }

  return `${amount.toLocaleString("sv-SE")} ${resolvedCurrency}`;
}

export function formatBidAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null) return "Inga bud";

  return formatAmount(amount, currency);
}

export function getCountryFlag(country: string | null | undefined): string {
  const code = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return "";
  }

  return String.fromCodePoint(
    ...Array.from(code).map((char) => 127397 + char.charCodeAt(0)),
  );
}

/**
 * Format a date for display.
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeStamp(
  dateStr: string | null | undefined,
): string {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
      "-",
    ) + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Normalize auction titles to sentence case for cleaner UI.
 */
export function normalizeAuctionTitle(
  title: string | null | undefined,
): string {
  const trimmed = title?.trim();
  if (!trimmed) return "";

  const lowerCased = trimmed.toLocaleLowerCase("sv-SE");
  const [firstCharacter, ...rest] = Array.from(lowerCased);

  return `${firstCharacter.toLocaleUpperCase("sv-SE")}${rest.join("")}`;
}

export function stripHtml(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const withoutTags = value.replace(/<[^>]*>/g, " ").replace(/[<>]/g, " ");

  return withoutTags
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      const normalizedEntity = entity.toLowerCase();
      const namedEntity = HTML_ENTITY_MAP[normalizedEntity];

      if (namedEntity != null) {
        return namedEntity;
      }

      if (normalizedEntity.startsWith("#x")) {
        const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : match;
      }

      if (normalizedEntity.startsWith("#")) {
        const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : match;
      }

      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Swap Skeleton image size suffix: _sm, _med, _lg.
 * Falls back to the original URL if no known suffix is found.
 */
export function imgSize(
  url: string | undefined | null,
  size: "sm" | "med" | "lg",
): string | undefined {
  if (!url) return undefined;
  return url.replace(/_(sm|med|lg)\.(jpe?g|png|webp)/i, `_${size}.$2`);
}

export function getLotImageSources(
  images: Array<string | null | undefined> | null | undefined,
  thumbnailUrl: string | null | undefined,
): string[] {
  return Array.from(
    new Set(
      [thumbnailUrl, ...(images ?? [])].filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}
