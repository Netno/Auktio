"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
      <div className="hidden h-10 w-64 animate-pulse rounded-full bg-white/[0.08] lg:block" />
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
      <div className="col-span-2 flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(216,178,107,0.2),rgba(255,255,255,0.08))] px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-md sm:col-span-1 sm:min-h-10 sm:rounded-full sm:px-2.5 sm:py-1.5 lg:col-span-auto">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[12px] font-semibold text-white shadow-inner shadow-black/10">
            <span>{initials}</span>
            <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border border-brand-900 bg-emerald-400" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/72">
                {roleLabel}
              </span>
              <span className="hidden text-[11px] text-emerald-100/90 sm:inline">
                Inloggad
              </span>
            </div>
            <div className="truncate text-[13px] font-semibold text-white">
              {displayName}
            </div>
            {session.user.email && (
              <div className="hidden truncate text-[11px] text-white/60 lg:block">
                {session.user.email}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={submitting}
          className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.08] px-3 text-[12px] font-medium text-white/78 transition-all hover:border-white/20 hover:bg-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Logga ut</span>
        </button>
        {errorMessage && (
          <span className="hidden text-[11px] text-rose-300 xl:block">
            {errorMessage}
          </span>
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
        className="group inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(216,178,107,0.24),rgba(255,255,255,0.08))] px-4 py-2.5 text-left text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-md transition-all hover:border-white/20 hover:bg-[linear-gradient(135deg,rgba(216,178,107,0.32),rgba(255,255,255,0.12))] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 sm:w-auto sm:min-w-[240px] sm:rounded-full sm:px-4 sm:py-1.5"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-white ring-1 ring-white/10 transition-transform group-hover:scale-[1.03]">
            <LogIn size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-white">
              Logga in
            </span>
            <span className="block truncate text-[11px] text-white/68">
              Spara bevakningar och fortsätt där du slutade
            </span>
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/72">
          Google
        </span>
      </button>
      {errorMessage && (
        <div className="mt-1 text-[11px] text-rose-300">{errorMessage}</div>
      )}
    </div>
  );
}
