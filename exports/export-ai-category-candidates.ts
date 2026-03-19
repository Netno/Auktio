import { readFileSync, writeFileSync } from "node:fs";
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
const LIMIT = Number(process.argv[2] ?? 500);
const OUTPUT_PATH =
  process.argv[3] ?? `exports/ai-category-candidates-${LIMIT}.json`;
const CURSOR_PATH = "exports/LastBatch.txt";

type LotRow = {
  id: number;
  title: string;
  description: string | null;
  categories: string[] | null;
  ai_categories: string[] | null;
  house_id: string;
  country: string | null;
  city: string | null;
  end_time: string | null;
  raw_data?: {
    category?: string[] | null;
  } | null;
};

function readCursor() {
  try {
    const raw = readFileSync(CURSOR_PATH, "utf8").trim();
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

async function main() {
  const nowIso = new Date().toISOString();
  const startAfterId = readCursor();
  const collected: Array<
    Omit<LotRow, "raw_data" | "ai_categories"> & {
      sourceCategories: string[];
      reviewReasons: CanonicalCategoryReviewReason[];
      aiCategories: string[];
    }
  > = [];
  let lastSeenId = startAfterId;
  let totalActiveLots = 0;
  let totalKnown = false;

  while (collected.length < LIMIT) {
    const { data, error, count } = await supabase
      .from("auc_lots")
      .select(
        "id, title, description, categories, ai_categories, house_id, country, city, end_time, raw_data",
        { count: totalKnown ? undefined : "exact" },
      )
      .gt("id", lastSeenId)
      .gt("end_time", nowIso)
      .is("availability", null)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

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

    lastSeenId = rows[rows.length - 1].id;

    for (const row of rows) {
      const reviewReasons = getCanonicalCategoryReviewReasons({
        categories: row.categories,
        rawCategories: row.raw_data?.category,
      });

      if (!reviewReasons.length) {
        continue;
      }

      collected.push({
        id: row.id,
        title: row.title,
        description: row.description,
        categories: row.categories ?? [],
        aiCategories: row.ai_categories ?? [],
        sourceCategories: row.raw_data?.category ?? [],
        reviewReasons,
        house_id: row.house_id,
        country: row.country,
        city: row.city,
        end_time: row.end_time,
      });

      if (collected.length >= LIMIT) {
        break;
      }
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }
  }

  const lastExportedId = collected[collected.length - 1]?.id ?? startAfterId;

  const payload = {
    exportedAt: new Date().toISOString(),
    totalActiveLots,
    exportedLots: collected.length,
    limit: LIMIT,
    startAfterId,
    lastExportedId,
    rows: collected,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(CURSOR_PATH, String(lastExportedId), "utf8");
  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        exportedLots: collected.length,
        totalActiveLots,
        limit: LIMIT,
        startAfterId,
        lastExportedId,
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