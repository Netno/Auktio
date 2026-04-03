"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

type AuthMode = "login" | "register" | "forgot";

function getInitialMode(value: string | null): AuthMode {
  if (value === "register" || value === "forgot") {
    return value;
  }

  return "login";
}

export default function EmailAuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(getInitialMode(searchParams.get("mode")));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const callbackUrl = useMemo(() => {
    const next = searchParams.get("next");
    return next?.trim() ? next : "/";
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrorMessage(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        const result = await signIn("credentials", {
          email,
          password,
          callbackUrl,
          redirect: false,
        });

        if (!result || result.error) {
          throw new Error(
            result?.error === "CredentialsSignin"
              ? "Fel e-post, losenord eller overifierad e-post."
              : result?.error ?? "Inloggning misslyckades.",
          );
        }

        router.push(result.url ?? callbackUrl);
        router.refresh();
        return;
      }

      if (mode === "register") {
        const response = await fetch("/api/auth/email/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, password }),
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Registrering misslyckades.");
        }

        setMessage(
          "Kontot skapades. Kontrollera din e-post och verifiera adressen innan du loggar in.",
        );
        setMode("login");
        setPassword("");
        return;
      }

      const response = await fetch("/api/auth/email/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error("Kunde inte skicka aterstallningslank.");
      }

      setMessage(
        "Om adressen finns i systemet har en aterstallningslank skickats.",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nagot gick fel.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-brand-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-md rounded-[28px] border border-brand-200 bg-white p-6 shadow-card sm:p-8">
        <h1 className="font-serif text-3xl text-brand-900">E-postinloggning</h1>
        <p className="mt-3 text-sm leading-6 text-brand-700">
          Logga in med e-post och lösenord, skapa konto eller be om en återställningslänk.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-brand-100 p-1">
          {[
            { key: "login", label: "Logga in" },
            { key: "register", label: "Skapa konto" },
            { key: "forgot", label: "Glomt" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setMode(item.key as AuthMode);
                setMessage(null);
                setErrorMessage(null);
              }}
              className={`min-h-10 rounded-xl px-3 text-sm font-medium transition ${mode === item.key ? "bg-white text-brand-900 shadow-sm" : "text-brand-600 hover:text-brand-900"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-brand-800">Namn</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 w-full rounded-xl border border-brand-200 px-3 text-sm text-brand-900 outline-none transition focus:border-brand-400"
                autoComplete="name"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-brand-800">E-post</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="h-11 w-full rounded-xl border border-brand-200 px-3 text-sm text-brand-900 outline-none transition focus:border-brand-400"
              autoComplete="email"
            />
          </label>

          {mode !== "forgot" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-brand-800">Losenord</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                className="h-11 w-full rounded-xl border border-brand-200 px-3 text-sm text-brand-900 outline-none transition focus:border-brand-400"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-900 px-4 text-sm font-medium text-white transition hover:bg-brand-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mode === "login"
              ? "Logga in"
              : mode === "register"
                ? "Skapa konto"
                : "Skicka återställningslänk"}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
        {errorMessage && <p className="mt-4 text-sm text-rose-700">{errorMessage}</p>}

        <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700">
          <div className="font-medium text-brand-900">Har du redan Google-login?</div>
          <p className="mt-1 leading-6">
            Om du registrerar samma e-post här länkas e-postinloggningen till samma konto istället för att skapa en ny användare.
          </p>
        </div>
      </div>
    </main>
  );
}