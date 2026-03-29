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

type MissingFilterValue = "any" | "missing" | "present";
type MissingPresetKey = "image-missing" | "image-present" | "embedding-missing";

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isTruthy(value: string | string[] | undefined) {
  const normalized = getSingleValue(value);
  return normalized === "1" || normalized === "true" || normalized === "on";
}

function getMissingFilterValue(
  value: string | string[] | undefined,
): MissingFilterValue {
  const normalized = getSingleValue(value);

  if (normalized === "present") {
    return "present";
  }

  if (
    normalized === "missing" ||
    normalized === "1" ||
    normalized === "true" ||
    normalized === "on"
  ) {
    return "missing";
  }

  return "any";
}

function buildAdminPresetHref(
  preset: MissingPresetKey,
  current: {
    houseId?: string;
    status?: "success" | "error" | "partial";
    allLots: boolean;
  },
) {
  const params = new URLSearchParams();

  if (current.houseId) {
    params.set("houseId", current.houseId);
  }

  if (current.status) {
    params.set("status", current.status);
  }

  if (current.allLots) {
    params.set("allLots", "on");
  }

  switch (preset) {
    case "image-missing":
      params.set("missingImageDescription", "missing");
      break;
    case "image-present":
      params.set("missingImageDescription", "present");
      break;
    case "embedding-missing":
      params.set("missingEmbedding", "missing");
      break;
  }

  const query = params.toString();
  return query.length > 0 ? `/admin?${query}` : "/admin";
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

function getStatusBadge(status: "success" | "error" | "partial") {
  switch (status) {
    case "success":
      return {
        icon: "✓",
        label: "OK",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "error":
      return {
        icon: "✕",
        label: "FAIL",
        className: "border-rose-200 bg-rose-50 text-rose-700",
      };
    case "partial":
    default:
      return {
        icon: "~",
        label: "DEL",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
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
  const missingCategories = getMissingFilterValue(
    searchParams?.missingCategories,
  );
  const missingAiTags = getMissingFilterValue(searchParams?.missingAiTags);
  const missingImageDescription = getMissingFilterValue(
    searchParams?.missingImageDescription,
  );
  const missingEmbedding = getMissingFilterValue(
    searchParams?.missingEmbedding,
  );
  const missingMatchParam = getSingleValue(searchParams?.missingMatch);
  const missingMatch = missingMatchParam === "all" ? "all" : "any";
  const allLots = !onlyActive;
  const imageMissingHref = buildAdminPresetHref("image-missing", {
    houseId,
    status: syncStatus,
    allLots,
  });
  const imagePresentHref = buildAdminPresetHref("image-present", {
    houseId,
    status: syncStatus,
    allLots,
  });
  const embeddingMissingHref = buildAdminPresetHref("embedding-missing", {
    houseId,
    status: syncStatus,
    allLots,
  });

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
      missingMatch,
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
              <span>kategorier</span>
              <select
                name="missingCategories"
                defaultValue={missingCategories}
                className="h-8 min-w-[92px] border border-brand-200 bg-white px-2 text-[12px] text-brand-900 outline-none"
              >
                <option value="any">visa alla</option>
                <option value="missing">saknas</option>
                <option value="present">finns</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1 text-brand-700">
              <span>ai-taggar</span>
              <select
                name="missingAiTags"
                defaultValue={missingAiTags}
                className="h-8 min-w-[92px] border border-brand-200 bg-white px-2 text-[12px] text-brand-900 outline-none"
              >
                <option value="any">visa alla</option>
                <option value="missing">saknas</option>
                <option value="present">finns</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1 text-brand-700">
              <span>bild</span>
              <select
                name="missingImageDescription"
                defaultValue={missingImageDescription}
                className="h-8 min-w-[92px] border border-brand-200 bg-white px-2 text-[12px] text-brand-900 outline-none"
              >
                <option value="any">visa alla</option>
                <option value="missing">saknas</option>
                <option value="present">finns</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1 text-brand-700">
              <span>embedding</span>
              <select
                name="missingEmbedding"
                defaultValue={missingEmbedding}
                className="h-8 min-w-[92px] border border-brand-200 bg-white px-2 text-[12px] text-brand-900 outline-none"
              >
                <option value="any">visa alla</option>
                <option value="missing">saknas</option>
                <option value="present">finns</option>
              </select>
            </label>
            <select
              name="missingMatch"
              defaultValue={missingMatch}
              className="h-8 min-w-[132px] border border-brand-200 bg-white px-2 text-[12px] text-brand-900 outline-none"
            >
              <option value="any">minst en vald saknas</option>
              <option value="all">alla valda saknas</option>
            </select>
            <label className="inline-flex items-center gap-1 text-brand-700">
              <input type="checkbox" name="allLots" defaultChecked={allLots} />
              alla lotter
            </label>

            <button
              type="submit"
              className="h-8 border border-brand-900 bg-brand-900 px-3 text-[12px] text-white"
            >
              filtrera
            </button>
          </form>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-brand-700">
            <span className="font-medium text-brand-900">Snabbval:</span>
            <Link
              href={imageMissingHref}
              className="inline-flex h-8 items-center border border-brand-200 bg-brand-50 px-3 text-brand-900 transition hover:border-brand-300 hover:bg-white"
            >
              bara bildluckor
            </Link>
            <Link
              href={imagePresentHref}
              className="inline-flex h-8 items-center border border-brand-200 bg-brand-50 px-3 text-brand-900 transition hover:border-brand-300 hover:bg-white"
            >
              utan bildluckor
            </Link>
            <Link
              href={embeddingMissingHref}
              className="inline-flex h-8 items-center border border-brand-200 bg-brand-50 px-3 text-brand-900 transition hover:border-brand-300 hover:bg-white"
            >
              bara embeddingsaknade
            </Link>
          </div>
        </section>

        <section className="border border-brand-200 bg-white px-3 py-2 font-mono text-[12px] text-brand-800">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              lista: {formatInteger(lotAudit.lots.length)}/
              {formatInteger(lotAudit.summary.total)}
            </span>
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
          {lotAudit.summary.total > lotAudit.lots.length && (
            <div className="mt-1 text-brand-500">
              visar forsta {formatInteger(lotAudit.lots.length)} av{" "}
              {formatInteger(lotAudit.summary.total)} matchande lotter
            </div>
          )}
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
                    <th className="px-2 py-1.5 text-left font-medium">tid</th>
                    <th className="px-2 py-1.5 text-left font-medium">hus</th>
                    <th className="px-2 py-1.5 text-right font-medium">+</th>
                    <th className="px-2 py-1.5 text-right font-medium">~</th>
                    <th className="px-2 py-1.5 text-right font-medium">=</th>
                    <th className="px-2 py-1.5 text-right font-medium">s</th>
                  </tr>
                </thead>
                <tbody>
                  {ingestRuns.map((run) => {
                    const statusBadge = getStatusBadge(run.status);

                    return (
                      <tr
                        key={run.id}
                        className="border-b border-brand-100 text-brand-800"
                      >
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex min-w-[52px] items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusBadge.className}`}
                              title={run.status}
                            >
                              <span>{statusBadge.icon}</span>
                              <span>{statusBadge.label}</span>
                            </span>
                            <span>{formatDateTime(run.startedAt)}</span>
                          </div>
                        </td>
                        <td
                          className="px-2 py-1.5"
                          title={run.errorMessage ?? undefined}
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate">{run.houseName}</span>
                            {run.errorMessage && (
                              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-rose-600">
                                fel
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right text-emerald-700">
                          {formatInteger(run.lotsAdded)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {formatInteger(run.lotsUpdated)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-brand-500">
                          {formatInteger(run.lotsSkipped)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-brand-500 whitespace-nowrap">
                          {formatDuration(run.durationMs)}
                        </td>
                      </tr>
                    );
                  })}
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
