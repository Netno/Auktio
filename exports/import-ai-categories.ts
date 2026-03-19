import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { normalizeSearchText } from "../src/lib/search-language";
import { CATEGORY_ORDER } from "../src/config/sources";

const INPUT_PATH =
  process.argv[2] ?? "exports/ai-categories-batch-001.result.json";

const CANONICAL_CATEGORY_SET = new Set(CATEGORY_ORDER);

type InputRow = {
  id: number;
  ai_categories?: string[];
  categories?: string[];
};

function sanitizeTags(tags: string[] | undefined) {
  if (!Array.isArray(tags)) return [];

  return Array.from(
    new Set(
      tags
        .map((tag) => normalizeSearchText(String(tag)))
        .filter((tag) => tag.length >= 2)
        .slice(0, 12),
    ),
  );
}

function sanitizeCanonicalCategories(categories: string[] | undefined) {
  if (!Array.isArray(categories)) return [];

  return Array.from(
    new Set(
      categories
        .map((category) => String(category).trim())
        .filter((category) => CANONICAL_CATEGORY_SET.has(category as (typeof CATEGORY_ORDER)[number]))
        .slice(0, 2),
    ),
  );
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

  const rows = JSON.parse(readFileSync(INPUT_PATH, "utf8")) as InputRow[];
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (!Number.isFinite(row.id)) {
      skipped++;
      continue;
    }

    const aiCategories = sanitizeTags(row.ai_categories);
    const categories = sanitizeCanonicalCategories(row.categories);
    if (!aiCategories.length && !categories.length) {
      skipped++;
      continue;
    }

    const nextUpdate: Record<string, unknown> = {};
    if (aiCategories.length) {
      nextUpdate.ai_categories = aiCategories;
    }
    if (categories.length) {
      nextUpdate.categories = categories;
    }

    const { error } = await supabase
      .from("auc_lots")
      .update(nextUpdate)
      .eq("id", row.id);

    if (error) {
      console.error(`[import-ai-categories] Lot ${row.id}: ${error.message}`);
      errors++;
      continue;
    }

    updated++;
  }

  console.log(
    JSON.stringify(
      {
        inputPath: INPUT_PATH,
        rows: rows.length,
        updated,
        skipped,
        errors,
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
