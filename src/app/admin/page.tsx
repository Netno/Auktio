import Link from "next/link";
import { getServerSession } from "next-auth";
import { AdminLotActions } from "@/components/AdminLotActions";
import { AdminUsersTable } from "@/components/AdminUsersTable";
import { Header } from "@/components/Header";
import {
  getAdminHouseOptions,
  getAdminIngestRuns,
  getAdminLotAudit,
} from "@/lib/admin-dashboard";
import { canAccessAdmin, listAppUsers } from "@/lib/app-users";
import { authOptions } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isTruthy(value: string | string[] | undefined) {
  const normalized = getSingleValue(value);
  return normalized === "1" || normalized === "true" || normalized === "on";
}

function formatInteger(value: number) {
  return value.toLocaleString("sv-SE");
}

function formatDuration(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("sv-SE", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMissingLabel(value: string) {
  switch (value) {
    case "categories":
      return "Kategorier";
    case "ai-tags":
      return "AI-taggar";
    case "image-description":
      return "Bildbeskrivning";
    case "embedding":
      return "Embedding";
    default:
      return value;
  }
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <main className="min-h-screen bg-brand-50">
        <Header />
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-12 sm:px-6">
          <div className="rounded-3xl border border-brand-200 bg-white p-8 shadow-card">
            <h1 className="font-serif text-3xl text-brand-900">Admin</h1>
            <p className="mt-3 text-sm leading-6 text-brand-700">
              Du måste vara inloggad för att se ingest-statistik och
              datakvalitet.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-brand-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-950"
            >
              Till startsidan
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!canAccessAdmin(session.user.role)) {
    return (
      <main className="min-h-screen bg-brand-50">
        <Header />
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-12 sm:px-6">
          <div className="rounded-3xl border border-brand-200 bg-white p-8 shadow-card">
            <h1 className="font-serif text-3xl text-brand-900">Admin</h1>
            <p className="mt-3 text-sm leading-6 text-brand-700">
              Ditt konto finns, men har inte admin-rättigheter än.
            </p>
            <p className="mt-2 text-sm leading-6 text-brand-700">
              Ge användaren rollen <strong>admin</strong> eller{" "}
              <strong>owner</strong> i <strong>auc_users</strong> första gången.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const houseId = getSingleValue(searchParams?.houseId);
  const syncStatus = getSingleValue(searchParams?.status) as
    | "success"
    | "error"
    | "partial"
    | undefined;
  const onlyActive = !isTruthy(searchParams?.allLots);
  const missingCategories = isTruthy(searchParams?.missingCategories);
  const missingAiTags = isTruthy(searchParams?.missingAiTags);
  const missingImageDescription = isTruthy(
    searchParams?.missingImageDescription,
  );
  const missingEmbedding = isTruthy(searchParams?.missingEmbedding);

  const [houses, ingestRuns, lotAudit, users] = await Promise.all([
    getAdminHouseOptions(),
    getAdminIngestRuns({ houseId, status: syncStatus, limit: 40 }),
    getAdminLotAudit({
      houseId,
      onlyActive,
      missingCategories,
      missingAiTags,
      missingImageDescription,
      missingEmbedding,
      limit: 150,
    }),
    listAppUsers(200),
  ]);

  return (
    <main className="min-h-screen bg-brand-50">
      <Header />

      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-3 py-3 text-[12px] sm:px-4">
        <section className="border border-brand-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[13px] text-brand-900">admin</div>
            <div className="text-brand-600">
              {session.user.email ?? session.user.name ?? "okänd användare"}
            </div>
          </div>

          <form className="mt-3 flex flex-wrap items-center gap-2">
            <select
              name="houseId"
              defaultValue={houseId ?? ""}
              className="h-8 min-w-[180px] border border-brand-200 bg-white px-2 text-[12px] text-brand-900 outline-none"
            >
              <option value="">alla hus</option>
              {houses.map((house) => (
                <option key={house.id} value={house.id}>
                  {house.name}
                </option>
              ))}
            </select>

            <select
              name="status"
              defaultValue={syncStatus ?? ""}
              className="h-8 min-w-[120px] border border-brand-200 bg-white px-2 text-[12px] text-brand-900 outline-none"
            >
              <option value="">alla status</option>
              <option value="success">success</option>
              <option value="partial">partial</option>
              <option value="error">error</option>
            </select>

            <label className="inline-flex items-center gap-1 text-brand-700">
              <input
                type="checkbox"
                name="missingCategories"
                defaultChecked={missingCategories}
              />
              kategorier
            </label>
            <label className="inline-flex items-center gap-1 text-brand-700">
              <input
                type="checkbox"
                name="missingAiTags"
                defaultChecked={missingAiTags}
              />
              ai-taggar
            </label>
            <label className="inline-flex items-center gap-1 text-brand-700">
              <input
                type="checkbox"
                name="missingImageDescription"
                defaultChecked={missingImageDescription}
              />
              bild
            </label>
            <label className="inline-flex items-center gap-1 text-brand-700">
              <input
                type="checkbox"
                name="missingEmbedding"
                defaultChecked={missingEmbedding}
              />
              embedding
            </label>
            <label className="inline-flex items-center gap-1 text-brand-700">
              <input
                type="checkbox"
                name="allLots"
                defaultChecked={!onlyActive}
              />
              alla lotter
            </label>

            <button
              type="submit"
              className="h-8 border border-brand-900 bg-brand-900 px-3 text-[12px] text-white"
            >
              filtrera
            </button>
          </form>
        </section>

        <section className="border border-brand-200 bg-white px-3 py-2 font-mono text-[12px] text-brand-800">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>lista: {formatInteger(lotAudit.summary.total)}</span>
            <span>
              kat: {formatInteger(lotAudit.summary.missingCategories)}
            </span>
            <span>ai: {formatInteger(lotAudit.summary.missingAiTags)}</span>
            <span>
              bild: {formatInteger(lotAudit.summary.missingImageDescription)}
            </span>
            <span>emb: {formatInteger(lotAudit.summary.missingEmbedding)}</span>
            <span>ingests: {formatInteger(ingestRuns.length)}</span>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[0.95fr_1.55fr]">
          <div className="border border-brand-200 bg-white">
            <div className="border-b border-brand-200 px-3 py-2 font-mono text-[12px] text-brand-900">
              ingest
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-[12px]">
                <thead className="border-b border-brand-200 bg-brand-50 text-brand-700">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">tid</th>
                    <th className="px-2 py-1 text-left font-medium">hus</th>
                    <th className="px-2 py-1 text-right font-medium">+</th>
                    <th className="px-2 py-1 text-right font-medium">~</th>
                    <th className="px-2 py-1 text-right font-medium">=</th>
                    <th className="px-2 py-1 text-right font-medium">s</th>
                  </tr>
                </thead>
                <tbody>
                  {ingestRuns.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b border-brand-100 align-top text-brand-800"
                    >
                      <td className="px-2 py-1 whitespace-nowrap">
                        <div>{formatDateTime(run.startedAt)}</div>
                        <div className="text-[11px] text-brand-500">
                          {run.status}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <div>{run.houseName}</div>
                        {run.errorMessage && (
                          <div className="max-w-[180px] truncate text-[11px] text-rose-600">
                            {run.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right text-emerald-700">
                        {formatInteger(run.lotsAdded)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatInteger(run.lotsUpdated)}
                      </td>
                      <td className="px-2 py-1 text-right text-brand-500">
                        {formatInteger(run.lotsSkipped)}
                      </td>
                      <td className="px-2 py-1 text-right text-brand-500">
                        {formatDuration(run.durationMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <AdminLotActions lots={lotAudit.lots} />
        </section>

        <AdminUsersTable users={users} />
      </div>
    </main>
  );
}
