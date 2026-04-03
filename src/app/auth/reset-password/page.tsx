"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/email/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Kunde inte återställa lösenordet.");
      }

      setMessage(
        "Ditt lösenord har uppdaterats. Du kan nu logga in med e-post och lösenord.",
      );
      setPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Något gick fel.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-brand-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-md rounded-[28px] border border-brand-200 bg-white p-6 shadow-card sm:p-8">
        <h1 className="font-serif text-3xl text-brand-900">Nytt lösenord</h1>
        <p className="mt-3 text-sm leading-6 text-brand-700">
          Ange ett nytt lösenord för ditt konto. Länken från e-postmeddelandet behövs för att detta ska fungera.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-brand-800">Nytt lösenord</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="h-11 w-full rounded-xl border border-brand-200 px-3 text-sm text-brand-900 outline-none transition focus:border-brand-400"
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !token}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-900 px-4 text-sm font-medium text-white transition hover:bg-brand-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Spara nytt lösenord
          </button>
        </form>

        {!token && (
          <p className="mt-4 text-sm text-rose-700">
            Återställningslänken saknar token eller är felaktig.
          </p>
        )}
        {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
        {errorMessage && <p className="mt-4 text-sm text-rose-700">{errorMessage}</p>}
      </div>
    </main>
  );
}