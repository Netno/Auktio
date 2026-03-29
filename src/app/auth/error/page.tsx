type AuthErrorPageProps = {
  searchParams?: {
    message?: string;
    error?: string;
  };
};

export default function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const message =
    searchParams?.message ??
    (searchParams?.error
      ? `Inloggningen kunde inte slutföras: ${searchParams.error}`
      : "Inloggningen kunde inte slutföras.");

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="max-w-md rounded-3xl border border-brand-200 bg-white p-8 shadow-card">
        <h1 className="font-serif text-2xl text-brand-900">
          Inloggning misslyckades
        </h1>
        <p className="mt-3 text-sm leading-6 text-brand-700">{message}</p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-brand-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-950"
        >
          Till startsidan
        </a>
      </div>
    </main>
  );
}
