type AuthCallbackPageProps = {
  searchParams?: {
    mode?: string;
    status?: string;
  };
};

function getCopy(mode?: string, status?: string) {
  if (mode === "verify-email" && status === "success") {
    return {
      title: "E-post verifierad",
      message:
        "Din e-postadress är nu verifierad. Du kan logga in med e-post och lösenord.",
    };
  }

  if (mode === "verify-email") {
    return {
      title: "Verifieringen misslyckades",
      message:
        "Lanken verkar ogiltig eller har redan anvants. Be om en ny verifieringslank om det behovs.",
    };
  }

  return {
    title: "Autentisering uppdaterad",
    message: "Ditt konto har uppdaterats.",
  };
}

export default function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const copy = getCopy(searchParams?.mode, searchParams?.status);

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="max-w-md rounded-3xl border border-brand-200 bg-white p-8 shadow-card">
        <h1 className="font-serif text-2xl text-brand-900">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-brand-700">{copy.message}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/auth/email"
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-950"
          >
            Till e-postinloggning
          </a>
          <a
            href="/"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-sm font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-50"
          >
            Till startsidan
          </a>
        </div>
      </div>
    </main>
  );
}