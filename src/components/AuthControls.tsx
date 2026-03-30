"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogIn, LogOut } from "lucide-react";
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

function getInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "AK";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
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

export function AuthControls() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
      <div className="hidden rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[12px] font-medium text-white/45 lg:block">
        Google-login ej aktiv
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
    const initials = getInitials(displayName);
    const roleLabel = getRoleLabel(session.user.role);

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
          className="group inline-flex min-h-10 w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-left text-white/88 transition-all hover:border-white/20 hover:bg-white/[0.1] sm:w-auto sm:max-w-[220px]"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-800 text-[11px] font-semibold text-white ring-1 ring-white/10">
            {initials}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-brand-900 bg-emerald-400" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-white">
              {displayName}
            </span>
            <span className="block truncate text-[10px] uppercase tracking-[0.12em] text-white/48">
              {roleLabel}
            </span>
          </span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-white/55 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-brand-950 p-1.5 shadow-2xl shadow-black/40">
            <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-white">
                    {displayName}
                  </div>
                  {session.user.email && (
                    <div className="truncate text-[11px] text-white/58">
                      {session.user.email}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.04] px-2.5 py-2 text-[11px] text-white/68">
                <span>Konto</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/76">
                  {roleLabel}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={submitting}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[12px] font-medium text-white/82 transition-all hover:border-white/20 hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-[13px] font-medium text-white/82 transition-all hover:border-white/20 hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        <LogIn size={14} />
        <span>Logga in</span>
      </button>
      {errorMessage && (
        <div className="mt-1 text-[11px] text-rose-300">{errorMessage}</div>
      )}
    </div>
  );
}
