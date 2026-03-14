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
