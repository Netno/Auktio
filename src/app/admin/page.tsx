import Link from "next/link";
import { getServerSession } from "next-auth";
import { CATEGORY_ORDER } from "@/config/sources";
import { AdminCategoryReview } from "@/components/AdminCategoryReview";
import { AdminLotActions } from "@/components/AdminLotActions";
import { AdminUsersTable } from "@/components/AdminUsersTable";
import { Header } from "@/components/Header";
import { searchAdminCategoryReviewLots } from "@/lib/admin-category-review";
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
type SyncStatus = "success" | "error" | "partial";

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

function formatMissingFilterState(value: MissingFilterValue) {
  switch (value) {
    case "missing":
      return "saknas";
    case "present":
      return "finns";
    default:
      return "alla";
  }
}

function formatSyncStatusLabel(value: SyncStatus) {
  switch (value) {
    case "success":
      return "OK";
    case "partial":
      return "Delvis";
    case "error":
      return "Fel";
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

const FILTER_SELECT_CLASSNAME =
  "h-10 w-full rounded-xl border border-brand-200 bg-white px-3 text-[13px] text-brand-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200";

const FILTER_LABEL_CLASSNAME =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-600";

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
  const reviewQuery = getSingleValue(searchParams?.reviewQuery)?.trim() ?? "";
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

  const [houses, ingestRuns, lotAudit, users, reviewLots] = await Promise.all([
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
    reviewQuery
      ? searchAdminCategoryReviewLots({
          query: reviewQuery,
          houseId,
          limit: 20,
        })
      : Promise.resolve([]),
  ]);

  const houseName = houseId
    ? (houses.find((house) => house.id === houseId)?.name ?? houseId)
    : null;
  const selectedMissingFilters = [
    { key: "categories", label: "Kategorier", value: missingCategories },
    { key: "ai-tags", label: "AI-taggar", value: missingAiTags },
    {
      key: "image-description",
      label: "Bildbeskrivning",
      value: missingImageDescription,
    },
    { key: "embedding", label: "Embedding", value: missingEmbedding },
  ].filter((item) => item.value !== "any");
  const activeFilters: string[] = [];

  if (houseName) {
    activeFilters.push(`Hus: ${houseName}`);
  }

  if (syncStatus) {
    activeFilters.push(`Ingeststatus: ${formatSyncStatusLabel(syncStatus)}`);
  }

  if (allLots) {
    activeFilters.push("Lotter: alla");
  }

  activeFilters.push(
    ...selectedMissingFilters.map(
      (item) => `${item.label}: ${formatMissingFilterState(item.value)}`,
    ),
  );

  if (selectedMissingFilters.length > 1 && missingMatch === "all") {
    activeFilters.push("Datakrav: alla valda måste matcha");
  }

  const preservedReviewSearchParams = Object.entries(
    searchParams ?? {},
  ).flatMap(([key, value]) => {
    if (key === "reviewQuery") {
      return [] as Array<{ key: string; value: string }>;
    }

    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values.map((item) => ({ key, value: item }));
  });

  const clearReviewHref = (() => {
    const params = new URLSearchParams();

    preservedReviewSearchParams.forEach((entry) => {
      params.append(entry.key, entry.value);
    });

    const query = params.toString();
    return query.length > 0 ? `/admin?${query}` : "/admin";
  })();

  return (
    <main className="min-h-screen bg-brand-50">
      <Header />

      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-3 py-3 text-[12px] sm:px-4">
        <section className="rounded-3xl border border-brand-200 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[13px] uppercase tracking-[0.12em] text-brand-500">
                Admin
              </div>
              <h1 className="mt-1 font-serif text-2xl text-brand-900">
                Ingest och datakvalitet
              </h1>
              <p className="mt-2 max-w-3xl text-[13px] leading-6 text-brand-700">
                Filtren nedan styr två saker: ingest-listan till vänster och
                listan med lotter som saknar data. Hus påverkar båda.
                Ingeststatus påverkar bara ingest-körningar. Datakvalitetsfälten
                påverkar bara lotter med saknad information.
              </p>
            </div>
            <div className="text-[12px] text-brand-600">
              {session.user.email ?? session.user.name ?? "okänd användare"}
            </div>
          </div>

          <form className="mt-4 space-y-4" method="get">
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-3">
                <label className={FILTER_LABEL_CLASSNAME}>Auktionshus</label>
                <select
                  name="houseId"
                  defaultValue={houseId ?? ""}
                  className={FILTER_SELECT_CLASSNAME}
                >
                  <option value="">Alla hus</option>
                  {houses.map((house) => (
                    <option key={house.id} value={house.id}>
                      {house.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[12px] text-brand-600">
                  Påverkar både ingest-körningar och listan med lotter.
                </p>
              </div>

              <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-3">
                <label className={FILTER_LABEL_CLASSNAME}>Ingeststatus</label>
                <select
                  name="status"
                  defaultValue={syncStatus ?? ""}
                  className={FILTER_SELECT_CLASSNAME}
                >
                  <option value="">Alla status</option>
                  <option value="success">OK</option>
                  <option value="partial">Delvis</option>
                  <option value="error">Fel</option>
                </select>
                <p className="mt-2 text-[12px] text-brand-600">
                  Påverkar bara tabellen med ingest-körningar.
                </p>
              </div>

              <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-3">
                <label className={FILTER_LABEL_CLASSNAME}>
                  Lotter att visa
                </label>
                <select
                  name="allLots"
                  defaultValue={allLots ? "on" : ""}
                  className={FILTER_SELECT_CLASSNAME}
                >
                  <option value="">Endast aktiva lotter</option>
                  <option value="on">Alla lotter</option>
                </select>
                <p className="mt-2 text-[12px] text-brand-600">
                  Påverkar bara listan med lotter som saknar data.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-brand-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[14px] font-semibold text-brand-900">
                    Datakvalitet
                  </h2>
                  <p className="mt-1 max-w-3xl text-[12px] leading-5 text-brand-600">
                    Välj vad som ska saknas eller finnas på lotterna. Om du inte
                    väljer något här visas ändå bara lotter som har minst en
                    datalucka.
                  </p>
                </div>
                <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] text-brand-700">
                  Standard: visar lotter med någon saknad data
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className={FILTER_LABEL_CLASSNAME}>Kategorier</label>
                  <select
                    name="missingCategories"
                    defaultValue={missingCategories}
                    className={FILTER_SELECT_CLASSNAME}
                  >
                    <option value="any">Spelar ingen roll</option>
                    <option value="missing">Saknas</option>
                    <option value="present">Finns</option>
                  </select>
                </div>
                <div>
                  <label className={FILTER_LABEL_CLASSNAME}>AI-taggar</label>
                  <select
                    name="missingAiTags"
                    defaultValue={missingAiTags}
                    className={FILTER_SELECT_CLASSNAME}
                  >
                    <option value="any">Spelar ingen roll</option>
                    <option value="missing">Saknas</option>
                    <option value="present">Finns</option>
                  </select>
                </div>
                <div>
                  <label className={FILTER_LABEL_CLASSNAME}>
                    Bildbeskrivning
                  </label>
                  <select
                    name="missingImageDescription"
                    defaultValue={missingImageDescription}
                    className={FILTER_SELECT_CLASSNAME}
                  >
                    <option value="any">Spelar ingen roll</option>
                    <option value="missing">Saknas</option>
                    <option value="present">Finns</option>
                  </select>
                </div>
                <div>
                  <label className={FILTER_LABEL_CLASSNAME}>Embedding</label>
                  <select
                    name="missingEmbedding"
                    defaultValue={missingEmbedding}
                    className={FILTER_SELECT_CLASSNAME}
                  >
                    <option value="any">Spelar ingen roll</option>
                    <option value="missing">Saknas</option>
                    <option value="present">Finns</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,280px)_1fr] lg:items-end">
                <div>
                  <label className={FILTER_LABEL_CLASSNAME}>
                    När flera saknas-filter är valda
                  </label>
                  <select
                    name="missingMatch"
                    defaultValue={missingMatch}
                    className={FILTER_SELECT_CLASSNAME}
                  >
                    <option value="any">
                      Minst ett av de valda villkoren räcker
                    </option>
                    <option value="all">Alla valda villkor måste matcha</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-950"
                  >
                    Använd filter
                  </button>
                  <Link
                    href="/admin"
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2 text-[13px] font-medium text-brand-800 transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    Återställ allt
                  </Link>
                </div>
              </div>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {activeFilters.length > 0 ? (
              activeFilters.map((filter) => (
                <span
                  key={filter}
                  className="inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-[11px] font-medium text-brand-700"
                >
                  {filter}
                </span>
              ))
            ) : (
              <span className="text-[12px] text-brand-500">
                Inga extra filter valda. Standardläget visar aktiva lotter med
                någon saknad data.
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-brand-700">
            <span className="font-medium text-brand-900">Snabbval:</span>
            <Link
              href={imageMissingHref}
              className="inline-flex min-h-9 items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-brand-900 transition hover:border-brand-300 hover:bg-white"
            >
              Lotter utan bildbeskrivning
            </Link>
            <Link
              href={imagePresentHref}
              className="inline-flex min-h-9 items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-brand-900 transition hover:border-brand-300 hover:bg-white"
            >
              Lotter med bildbeskrivning
            </Link>
            <Link
              href={embeddingMissingHref}
              className="inline-flex min-h-9 items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-brand-900 transition hover:border-brand-300 hover:bg-white"
            >
              Lotter utan embedding
            </Link>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-2xl border border-brand-200 bg-white px-3 py-3 shadow-card xl:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
              Visade lotter
            </div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">
              {formatInteger(lotAudit.lots.length)}
            </div>
            <div className="text-[12px] text-brand-600">
              av {formatInteger(lotAudit.matchingTotal)} matchande
            </div>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-white px-3 py-3 shadow-card xl:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
              Kategorier saknas
            </div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">
              {formatInteger(lotAudit.summary.missingCategories)}
            </div>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-white px-3 py-3 shadow-card xl:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
              AI-taggar saknas
            </div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">
              {formatInteger(lotAudit.summary.missingAiTags)}
            </div>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-white px-3 py-3 shadow-card xl:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
              Bildbeskrivning saknas
            </div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">
              {formatInteger(lotAudit.summary.missingImageDescription)}
            </div>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-white px-3 py-3 shadow-card xl:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
              Embedding saknas
            </div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">
              {formatInteger(lotAudit.summary.missingEmbedding)}
            </div>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-white px-3 py-3 shadow-card xl:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
              Ingest-körningar
            </div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">
              {formatInteger(ingestRuns.length)}
            </div>
          </div>

          {lotAudit.matchingTotal > lotAudit.lots.length && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50 px-3 py-3 text-[12px] text-brand-600 md:col-span-2 xl:col-span-6">
              Visar de första {formatInteger(lotAudit.lots.length)} av{" "}
              {formatInteger(lotAudit.matchingTotal)} matchande lotter.
            </div>
          )}
        </section>

        <AdminCategoryReview
          lots={reviewLots}
          reviewQuery={reviewQuery}
          availableCategories={[...CATEGORY_ORDER]}
          preservedSearchParams={preservedReviewSearchParams}
          clearSearchHref={clearReviewHref}
        />

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
