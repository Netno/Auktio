import { readFileSync, writeFileSync } from "node:fs";

const inputPath = process.argv[2] ?? "exports/ai-category-candidates-remaining.json";
const outputBase = process.argv[3] ?? "exports/ai-category-candidates-remaining";
const countries = ["DK", "SE", "AT", "NO"] as const;

function main() {
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const buckets = new Map<string, unknown[]>();

  for (const country of countries) {
    buckets.set(country, []);
  }

  for (const row of rows) {
    const country = String((row as { country?: string | null }).country ?? "");
    if (!buckets.has(country)) {
      continue;
    }

    buckets.get(country)!.push(row);
  }

  const summary = [] as Array<{ country: string; exportedLots: number; outputPath: string }>;

  for (const country of countries) {
    const countryRows = buckets.get(country) ?? [];
    const outputPath = `${outputBase}-${country}.json`;
    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          country,
          exportedLots: countryRows.length,
          rows: countryRows,
        },
        null,
        2,
      ),
      "utf8",
    );

    summary.push({ country, exportedLots: countryRows.length, outputPath });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
