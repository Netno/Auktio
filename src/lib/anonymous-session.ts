export const ANONYMOUS_SESSION_COOKIE_NAME = "auktio_session_id";
export const ANONYMOUS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function buildCookieAttributes(maxAgeSeconds: number) {
  const attributes = [`Max-Age=${maxAgeSeconds}`, "Path=/", "SameSite=Lax"];

  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function generateAnonymousSessionId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readAnonymousSessionId() {
  if (typeof document === "undefined") {
    return null;
  }

  const cookieValue = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${ANONYMOUS_SESSION_COOKIE_NAME}=`));

  if (!cookieValue) {
    return null;
  }

  const value = cookieValue.slice(ANONYMOUS_SESSION_COOKIE_NAME.length + 1);
  return value.trim().length > 0 ? decodeURIComponent(value) : null;
}

export function writeAnonymousSessionId(sessionId: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${ANONYMOUS_SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; ${buildCookieAttributes(ANONYMOUS_SESSION_MAX_AGE_SECONDS)}`;
}

export function ensureAnonymousSessionId() {
  const existingSessionId = readAnonymousSessionId();

  if (existingSessionId) {
    return existingSessionId;
  }

  const sessionId = generateAnonymousSessionId();
  writeAnonymousSessionId(sessionId);
  return sessionId;
}

export function clearAnonymousSessionId() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${ANONYMOUS_SESSION_COOKIE_NAME}=; ${buildCookieAttributes(0)}`;
}
