import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

const PAGE_SIZE = 1000;
const OUTPUT_PATH = "exports/ai-category-candidates-diverse-only.json";

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

async function main() {
  const nowIso = new Date().toISOString();
  let offset = 0;
  const collected: Array<
    Omit<LotRow, "raw_data" | "ai_categories"> & {
      aiCategories: string[];
      sourceCategories: string[];
    }
  > = [];

  while (true) {
    const { data, error } = await supabase
      .from("auc_lots")
      .select(
        "id, title, description, categories, ai_categories, house_id, country, city, end_time, raw_data",
      )
      .gt("end_time", nowIso)
      .is("availability", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as LotRow[];
    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      if (!row.categories?.includes("Diverse")) {
        continue;
      }

      collected.push({
        id: row.id,
        title: row.title,
        description: row.description,
        categories: row.categories ?? [],
        aiCategories: row.ai_categories ?? [],
        sourceCategories: row.raw_data?.category ?? [],
        house_id: row.house_id,
        country: row.country,
        city: row.city,
        end_time: row.end_time,
      });
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  const byCountry = Object.entries(
    collected.reduce<Record<string, number>>((accumulator, row) => {
      const key = row.country ?? "unknown";
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([country, count]) => ({ country, count }))
    .sort((left, right) => right.count - left.count);

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        exportedLots: collected.length,
        byCountry,
        rows: collected,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        exportedLots: collected.length,
        byCountry,
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
