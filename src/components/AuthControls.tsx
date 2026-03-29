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
      <div className="hidden rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/45 lg:block">
        Google-login ej aktiv
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="hidden h-9 w-28 animate-pulse rounded-lg bg-white/[0.08] lg:block" />
    );
  }

  if (session?.user) {
    const displayName = getDisplayName(
      session.user.email,
      typeof session.user.name === "string" ? session.user.name : undefined,
    );

    return (
      <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 sm:col-span-1 sm:min-h-9 sm:justify-end sm:rounded-lg sm:px-3 sm:py-1.5 lg:col-span-auto">
        <div className="min-w-0 text-right">
          <div className="truncate text-[12px] font-medium text-white/90">
            {displayName}
          </div>
          {session.user.email && (
            <div className="hidden truncate text-[11px] text-white/55 lg:block">
              {session.user.email}
            </div>
          )}
        </div>
        <button
          onClick={handleSignOut}
          disabled={submitting}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/75 transition-all hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut size={14} />
          <span>Logga ut</span>
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
        onClick={handleSignIn}
        disabled={submitting}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-[13px] font-medium text-white/80 transition-all hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9 sm:w-auto sm:rounded-lg sm:px-4 sm:py-1.5"
      >
        <LogIn size={14} />
        <span>Logga in / registrera</span>
      </button>
      {errorMessage && (
        <div className="mt-1 text-[11px] text-rose-300">{errorMessage}</div>
      )}
    </div>
  );
}
