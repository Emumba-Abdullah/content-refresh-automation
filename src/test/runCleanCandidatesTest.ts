import fs from "node:fs";
import path from "node:path";
import { fetchMicrosoftLearnPostgresCandidates } from "../fetchers/microsoftLearnPostgres";
import { cleanCandidates } from "../process/cleanCandidates";

const OUTPUT_PATH = path.resolve(process.cwd(), "output/cleaned-candidates.json");

async function main() {
  const fetched = await fetchMicrosoftLearnPostgresCandidates();
  const { cleaned, removed } = cleanCandidates(fetched);

  const reasonCounts = removed.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  console.log("\n===== CLEANING SUMMARY =====");
  console.log(`Fetched: ${fetched.length}`);
  console.log(`Cleaned: ${cleaned.length}`);
  console.log(`Removed: ${removed.length}`);

  console.log("\n===== REMOVAL REASONS =====");
  for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`${reason}: ${count}`);
  }

  console.log("\n===== FIRST 10 CLEANED CANDIDATES =====");
  cleaned.slice(0, 10).forEach((candidate, index) => {
    console.log("\n------------------------------------");
    console.log(`#${index + 1}`);
    console.log(`Title: ${candidate.title}`);
    console.log(`Description: ${candidate.description}`);
    console.log(`Website: ${candidate.website}`);
    console.log(`Date: ${candidate.date ?? "[none]"}`);
  });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cleaned, null, 2), "utf-8");
  console.log(`\nSaved ${cleaned.length} cleaned candidates -> ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("Cleaning test failed:");
  console.error(error);
  process.exit(1);
});