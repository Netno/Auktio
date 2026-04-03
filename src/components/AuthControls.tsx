"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogIn, LogOut, User2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { getProviders, signIn, signOut, useSession } from "next-auth/react";

type GoogleProviderConfig = {
  id: string;
  name: string;
  type: string;
  signinUrl: string;
  callbackUrl: string;
};

function getDisplayName(email: string | null | undefined, fullName?: string) {
  if (fullName?.trim()) {
    return fullName.trim();
  }

  if (!email) {
    return "Inloggad";
  }

  return email.split("@")[0];
}

function getRoleLabel(role: string) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "owner") {
    return "Ägare";
  }

  return "Konto";
}

function getProviderLabel(provider: string | null | undefined) {
  if (provider === "google") {
    return "Google";
  }

  if (!provider) {
    return "Okänd";
  }

  return provider;
}

function formatLastLogin(value: string | null | undefined) {
  if (!value) {
    return "Saknas";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saknas";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatUserId(value: string | null | undefined) {
  if (!value) {
    return "Saknas";
  }

  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function AuthControls() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [googleProvider, setGoogleProvider] =
    useState<GoogleProviderConfig | null>(null);

  const nextPath = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    let isCancelled = false;

    getProviders()
      .then((providers) => {
        if (isCancelled) {
          return;
        }

        const provider = providers?.google;
        setGoogleProvider(provider ?? null);
      })
      .catch(() => {
        if (!isCancelled) {
          setGoogleProvider(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [session?.user?.image]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    if (!menuOpen) {
      return;
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  async function handleSignIn() {
    setErrorMessage(null);
    setSubmitting(true);

    try {
      await signIn("google", { callbackUrl: nextPath });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Inloggning misslyckades.",
      );
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    setErrorMessage(null);
    setSubmitting(true);

    try {
      await signOut({ callbackUrl: nextPath });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Utloggning misslyckades.",
      );
      setSubmitting(false);
    }
  }

  if (!googleProvider) {
    return (
      <div className="hidden items-center gap-3 lg:inline-flex">
        <div className="h-9 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-[12px] font-medium leading-9 text-white/45">
          Google-login ej aktiv
        </div>
        <a
          href={`/auth/email?next=${encodeURIComponent(nextPath)}`}
          className="text-[12px] font-medium text-white/72 transition hover:text-white"
        >
          E-post i stället
        </a>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="hidden h-10 w-36 animate-pulse rounded-full bg-white/[0.08] lg:block" />
    );
  }

  if (session?.user) {
    const displayName = getDisplayName(
      session.user.email,
      typeof session.user.name === "string" ? session.user.name : undefined,
    );
    const roleLabel = getRoleLabel(session.user.role);
    const accountStatus = session.user.isActive ? "Aktiv" : "Inaktiv";
    const providerLabel = getProviderLabel(session.user.authProvider);
    const lastLoginLabel = formatLastLogin(session.user.lastLoginAt);
    const userIdLabel = formatUserId(session.user.id);
    const avatarUrl =
      !avatarLoadFailed && typeof session.user.image === "string"
        ? session.user.image
        : null;

    return (
      <div
        ref={containerRef}
        className="relative col-span-2 sm:col-span-1 lg:col-span-auto"
      >
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          aria-expanded={menuOpen}
          aria-label="Öppna kontomeny"
          className="group inline-flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-left text-white/88 transition-all hover:border-white/20 hover:bg-white/[0.1] sm:h-9 sm:min-h-0 sm:w-auto sm:max-w-[248px] sm:rounded-lg sm:py-0"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-white/10 sm:h-7 sm:w-7">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-8 w-8 rounded-full object-cover sm:h-7 sm:w-7"
                referrerPolicy="no-referrer"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-800 text-white sm:h-7 sm:w-7">
                <User2 size={14} strokeWidth={2.2} />
              </span>
            )}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-brand-900 bg-emerald-400" />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span className="truncate text-[13px] font-semibold text-white">
              {displayName}
            </span>
            <span className="shrink-0 rounded-full border border-white/16 bg-white/[0.14] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {roleLabel}
            </span>
          </span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-white/55 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[260px] overflow-hidden rounded-2xl border border-brand-200 bg-brand-50 p-1.5 shadow-[0_18px_40px_rgba(26,26,24,0.18)]">
            <div className="rounded-xl border border-brand-200 bg-white px-3 py-3 shadow-card">
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-10 w-10 shrink-0 rounded-full border border-brand-200 object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-900 text-white">
                    <User2 size={16} strokeWidth={2.2} />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-brand-900">
                    {displayName}
                  </div>
                  {session.user.email && (
                    <div className="truncate text-[11px] text-brand-500">
                      {session.user.email}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-100 px-2.5 py-2 text-[11px] text-brand-600">
                <span>Konto</span>
                <span className="rounded-full bg-brand-300/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-800">
                  {roleLabel}
                </span>
              </div>

              <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
                  Användardetaljer
                </div>
                <dl className="mt-2 space-y-2 text-[11px] text-brand-700">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-brand-500">Status</dt>
                    <dd className="text-right font-medium text-brand-900">
                      {accountStatus}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-brand-500">Inloggad med</dt>
                    <dd className="text-right font-medium text-brand-900">
                      {providerLabel}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-brand-500">Senaste inloggning</dt>
                    <dd className="text-right font-medium text-brand-900">
                      {lastLoginLabel}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-brand-500">Användar-ID</dt>
                    <dd className="text-right font-medium text-brand-900">
                      {userIdLabel}
                    </dd>
                  </div>
                </dl>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={submitting}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 text-[12px] font-medium text-brand-800 transition-all hover:border-brand-300 hover:bg-brand-100 hover:text-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut size={14} />
                <span>Logga ut</span>
              </button>

              {errorMessage && (
                <div className="mt-2 text-[11px] text-rose-300">
                  {errorMessage}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="col-span-2 sm:col-span-1 lg:col-span-auto">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={submitting}
        className="group inline-flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-left text-white/88 transition-all hover:border-white/20 hover:bg-white/[0.1] sm:h-9 sm:min-h-0 sm:w-auto sm:rounded-lg sm:py-0"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-800 text-white ring-1 ring-white/10 sm:h-7 sm:w-7">
          <LogIn size={14} className="text-current" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
          Logga in
        </span>
      </button>
      <a
        href={`/auth/email?next=${encodeURIComponent(nextPath)}`}
        className="mt-1.5 inline-flex text-[11px] text-white/72 transition hover:text-white"
      >
        Logga in med e-post i stället
      </a>
      {errorMessage && (
        <div className="mt-1 text-[11px] text-rose-300">{errorMessage}</div>
      )}
    </div>
  );
}
