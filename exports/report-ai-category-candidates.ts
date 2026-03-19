import { createClient } from "@supabase/supabase-js";
import {
  getCanonicalCategoryReviewReasons,
  type CanonicalCategoryReviewReason,
} from "../src/lib/canonical-category-review";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

const PAGE_SIZE = 500;

type LotRow = {
  id: number;
  categories: string[] | null;
  ai_categories: string[] | null;
  house_id: string;
  country: string | null;
  raw_data?: {
    category?: string[] | null;
  } | null;
};

async function main() {
  const nowIso = new Date().toISOString();
  let offset = 0;
  let totalActiveLots = 0;
  let totalKnown = false;
  let candidates = 0;

  const reasonCounts: Record<CanonicalCategoryReviewReason, number> = {
    "missing-categories": 0,
    "contains-diverse": 0,
    "generic-raw-category": 0,
  };

  const byHouse: Record<string, number> = {};
  const byCountry: Record<string, number> = {};

  while (true) {
    const { data, error, count } = await supabase
      .from("auc_lots")
      .select("id, categories, ai_categories, house_id, country, raw_data", {
        count: totalKnown ? undefined : "exact",
      })
      .gt("end_time", nowIso)
      .is("availability", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!totalKnown) {
      totalActiveLots = count ?? 0;
      totalKnown = true;
    }

    const rows = (data ?? []) as LotRow[];
    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      const reasons = getCanonicalCategoryReviewReasons({
        categories: row.categories,
        rawCategories: row.raw_data?.category,
      });

      if (!reasons.length) {
        continue;
      }

      candidates++;
      byHouse[row.house_id] = (byHouse[row.house_id] ?? 0) + 1;
      byCountry[row.country ?? "unknown"] =
        (byCountry[row.country ?? "unknown"] ?? 0) + 1;

      for (const reason of reasons) {
        reasonCounts[reason] += 1;
      }
    }

    offset += PAGE_SIZE;
  }

  const topHouses = Object.entries(byHouse)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([houseId, count]) => ({ houseId, count }));

  const countries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .map(([country, count]) => ({ country, count }));

  console.log(
    JSON.stringify(
      {
        activeLots: totalActiveLots,
        candidateLots: candidates,
        reasonCounts,
        countries,
        topHouses,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});