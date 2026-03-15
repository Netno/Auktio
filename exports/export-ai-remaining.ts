import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

const PAGE_SIZE = 500;
const OUTPUT_PATH = "exports/ai-categories-batch-rest.json";

type LotRow = {
  id: number;
  title: string;
  description: string | null;
  categories: string[] | null;
  ai_categories: string[] | null;
  house_id: string;
  end_time: string | null;
  availability: string | null;
};

async function main() {
  const nowIso = new Date().toISOString();
  const collected: LotRow[] = [];
  let offset = 0;
  let totalActiveLots = 0;
  let totalKnown = false;

  while (true) {
    const { data, error, count } = await supabase
      .from("auc_lots")
      .select(
        "id, title, description, categories, ai_categories, house_id, end_time, availability",
        { count: totalKnown ? undefined : "exact" },
      )
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
      if ((row.ai_categories ?? []).length === 0) {
        collected.push(row);
      }
    }

    offset += PAGE_SIZE;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    totalActiveLots,
    activeLotsScanned: offset,
    exportedLots: collected.length,
    rows: collected.map((lot) => ({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      categories: lot.categories ?? [],
      houseId: lot.house_id,
      endTime: lot.end_time,
    })),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        exportedLots: collected.length,
        totalActiveLots,
        activeLotsScanned: offset,
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