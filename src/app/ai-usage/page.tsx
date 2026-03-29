import Link from "next/link";
import { getServerSession } from "next-auth";
import { Header } from "@/components/Header";
import { getAiUsageDashboardData } from "@/lib/ai-usage-log";
import { canAccessAdmin } from "@/lib/app-users";
import { authOptions } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

function formatInteger(value: number) {
  return value.toLocaleString("sv-SE");
}

function formatSeconds(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function formatCurrencySek(value: number | null) {
  if (value == null) {
    return "–";
  }

  return `${value.toFixed(2).replace(".", ",")} kr`;
}

function formatHourLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("sv-SE", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AiUsagePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <main className="min-h-screen bg-brand-50">
        <Header />
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-12 sm:px-6">
          <div className="rounded-3xl border border-brand-200 bg-white p-8 shadow-card">
            <h1 className="font-serif text-3xl text-brand-900">
              AI-statistik
            </h1>
            <p className="mt-3 text-sm leading-6 text-brand-700">
              Du måste vara inloggad för att se AI-användning och kostnadsdata.
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
            <h1 className="font-serif text-3xl text-brand-900">
              AI-statistik
            </h1>
            <p className="mt-3 text-sm leading-6 text-brand-700">
              Ditt konto saknar rättighet att se AI-användning och kostnadsdata.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const report = await getAiUsageDashboardData(30);
  const chartDays =
    report.daily.filter((row) => (row.estimatedCostSek ?? 0) > 0).length > 0
      ? report.daily.filter((row) => (row.estimatedCostSek ?? 0) > 0)
      : report.daily;
  const maxDailyCost = chartDays.reduce(
    (currentMax, row) => Math.max(currentMax, row.estimatedCostSek ?? 0),
    0,
  );
  const last24Hours = report.hourly.slice(-24);
  const maxHourlyCost = last24Hours.reduce(
    (currentMax, row) => Math.max(currentMax, row.estimatedCostSek ?? 0),
    0,
  );
  const latestDaily = report.daily[report.daily.length - 1] ?? null;
  const currentDayCost = latestDaily?.estimatedCostSek ?? null;
  const rolling24HourCost =
    last24Hours.reduce((sum, row) => sum + (row.estimatedCostSek ?? 0), 0) ||
    null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <Header activeView="ai-usage" />
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                AI-användning
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Rapporterar loggade Gemini-anrop de senaste 30 dagarna. Endast
                trafik som loggats efter att usage-spårningen aktiverades syns
                här.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-right">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Loggning sedan
              </div>
              <div className="mt-1 text-sm font-medium text-slate-200">
                {report.startedAt
                  ? new Date(report.startedAt).toLocaleDateString("sv-SE")
                  : "Ingen data än"}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                USD/SEK: {report.pricing.usdToSek?.toFixed(4) ?? "ej satt"}
                {report.pricing.usdToSekFetchedAt
                  ? ` • hämtad ${new Date(report.pricing.usdToSekFetchedAt).toLocaleDateString("sv-SE")}`
                  : ""}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-800/70 p-5">
              <div className="text-sm text-slate-400">Lyckade anrop</div>
              <div className="mt-2 text-4xl font-semibold text-emerald-400">
                {formatInteger(report.totals.success)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/70 p-5">
              <div className="text-sm text-slate-400">Misslyckade</div>
              <div className="mt-2 text-4xl font-semibold text-rose-400">
                {formatInteger(report.totals.errors)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/70 p-5">
              <div className="text-sm text-slate-400">Cache-träffar</div>
              <div className="mt-2 text-4xl font-semibold text-cyan-400">
                {formatInteger(report.totals.cacheHits)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/70 p-5">
              <div className="text-sm text-slate-400">Kostnad idag</div>
              <div className="mt-2 text-4xl font-semibold text-amber-300">
                {formatCurrencySek(currentDayCost)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-800/50 p-5">
              <div className="text-sm text-slate-400">Input tokens</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatInteger(report.totals.inputTokens)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/50 p-5">
              <div className="text-sm text-slate-400">Output tokens</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatInteger(report.totals.outputTokens)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/50 p-5">
              <div className="text-sm text-slate-400">Totalt tokens</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatInteger(report.totals.totalTokens)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/50 p-5">
              <div className="text-sm text-slate-400">Snitt svarstid</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatSeconds(report.totals.averageLatencyMs)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-800/50 p-5">
              <div className="text-sm text-slate-400">Totalt AI-anrop</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatInteger(report.totals.requests)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/50 p-5">
              <div className="text-sm text-slate-400">Kostnad senaste 24h</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatCurrencySek(rolling24HourCost)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/50 p-5">
              <div className="text-sm text-slate-400">Total tid i AI</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatSeconds(report.totals.totalLatencyMs)}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">
              Kostnad per dag
            </h2>
            <p className="text-sm text-slate-400">Senaste 30 dagarna</p>
          </div>
          <div className="mt-6 overflow-x-auto">
            <div className="flex min-w-[720px] items-end gap-3">
              {chartDays.map((row) => (
                <div
                  key={row.date}
                  className="flex w-10 flex-col items-center gap-2"
                >
                  <div className="flex h-56 w-full items-end rounded-t-xl bg-slate-950/40 px-1.5 py-2">
                    <div
                      className="w-full rounded-md bg-amber-400"
                      style={{
                        height: `${maxDailyCost > 0 ? Math.max(((row.estimatedCostSek ?? 0) / maxDailyCost) * 100, 4) : 0}%`,
                      }}
                      title={`${row.date}: ${formatCurrencySek(row.estimatedCostSek)}`}
                    />
                  </div>
                  <div className="text-center text-[10px] text-amber-300">
                    {row.estimatedCostSek != null
                      ? row.estimatedCostSek.toFixed(2).replace(".", ",")
                      : "–"}
                  </div>
                  <div className="text-center text-xs text-slate-400">
                    {row.date.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">
              Kostnad per timme
            </h2>
            <p className="text-sm text-slate-400">Senaste 24 timmarna</p>
          </div>
          <div className="mt-6 overflow-x-auto">
            <div className="flex min-w-[960px] items-end gap-3">
              {last24Hours.map((row) => (
                <div
                  key={row.hour}
                  className="flex w-12 flex-col items-center gap-2"
                >
                  <div className="flex h-48 w-full items-end rounded-t-xl bg-slate-950/40 px-1.5 py-2">
                    <div
                      className="w-full rounded-md bg-cyan-400"
                      style={{
                        height: `${maxHourlyCost > 0 ? Math.max(((row.estimatedCostSek ?? 0) / maxHourlyCost) * 100, 4) : 0}%`,
                      }}
                      title={`${formatHourLabel(row.hour)}: ${formatCurrencySek(row.estimatedCostSek)}`}
                    />
                  </div>
                  <div className="text-center text-[10px] text-cyan-300">
                    {row.estimatedCostSek != null
                      ? row.estimatedCostSek.toFixed(2).replace(".", ",")
                      : "–"}
                  </div>
                  <div className="text-center text-[10px] text-slate-400">
                    {formatHourLabel(row.hour)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
            <h2 className="text-xl font-semibold text-white">Modeller</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-950/40 text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Modell</th>
                    <th className="px-4 py-3 text-right font-medium">Anrop</th>
                    <th className="px-4 py-3 text-right font-medium">Tokens</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Snittid
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/30 text-slate-200">
                  {report.models.map((row) => (
                    <tr key={row.model}>
                      <td className="px-4 py-3">{row.model}</td>
                      <td className="px-4 py-3 text-right">
                        {formatInteger(row.requests)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatInteger(row.totalTokens)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatSeconds(row.averageLatencyMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
            <h2 className="text-xl font-semibold text-white">AI-historik</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-950/40 text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Datum</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Kostnad
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Anrop</th>
                    <th className="px-4 py-3 text-right font-medium">Fel</th>
                    <th className="px-4 py-3 text-right font-medium">Cache</th>
                    <th className="px-4 py-3 text-right font-medium">Tokens</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Latency
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/30 text-slate-200">
                  {report.daily
                    .slice()
                    .reverse()
                    .map((row) => (
                      <tr key={row.date}>
                        <td className="px-4 py-3">{row.date}</td>
                        <td className="px-4 py-3 text-right text-amber-300">
                          {formatCurrencySek(row.estimatedCostSek)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-400">
                          {formatInteger(row.requests)}
                        </td>
                        <td className="px-4 py-3 text-right text-rose-400">
                          {formatInteger(row.errors)}
                        </td>
                        <td className="px-4 py-3 text-right text-cyan-400">
                          {formatInteger(row.cacheHits)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatInteger(row.totalTokens)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400">
                          {formatSeconds(row.totalLatencyMs)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
