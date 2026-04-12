import fs from "node:fs";
import path from "node:path";
import { fetchMicrosoftLearnPostgresCandidates } from "../fetchers/microsoftLearnPostgres";
import { cleanCandidates } from "../process/cleanCandidates";
import { selectCandidates, ScoredCandidate } from "../process/selectCandidates";

const OUTPUT_PATH = path.resolve(process.cwd(), "output/selected-candidates.json");

function printSamples(label: string, items: ScoredCandidate[], n: number) {
  console.log(`\n--- ${label} (top ${Math.min(n, items.length)}) ---`);
  for (const item of items.slice(0, n)) {
    const scoreLabel = item.score > 0 ? `+${item.score}` : `${item.score}`;
    const hardTag = item.hardDrop ? `  [HARD DROP: "${item.hardDrop}"]` : "";
    console.log(`  [${scoreLabel}] ${item.candidate.title}${hardTag}`);
    if (item.matchedPositive.length)
      console.log(`        + ${item.matchedPositive.join(", ")}`);
    if (item.matchedNegative.length)
      console.log(`        - ${item.matchedNegative.join(", ")}`);
  }
}

async function main() {
  // Load enriched candidates from cache, clean them
  const fetched = await fetchMicrosoftLearnPostgresCandidates();
  const { cleaned } = cleanCandidates(fetched);

  // Run selection scoring
  const { high, mid, low } = selectCandidates(cleaned);

  console.log("\n===== SELECTION SUMMARY =====");
  console.log(`Total cleaned  : ${cleaned.length}`);
  console.log(`HIGH VALUE     : ${high.length}  → goes to LLM`);
  console.log(`MID VALUE      : ${mid.length}  → optional`);
  console.log(`LOW VALUE      : ${low.length}  → dropped before LLM`);
  const hardDropped = low.filter(s => s.hardDrop !== null);
  console.log(`  of which hard-dropped (infra): ${hardDropped.length}`);
  console.log(`  of which scored-out          : ${low.length - hardDropped.length}`);

  printSamples("TOP KEPT (HIGH)", high, 10);
  printSamples("TOP MID (borderline)", mid, 5);
  printSamples("TOP DROPPED (LOW — scored)", low.filter(s => !s.hardDrop), 5);
  printSamples("HARD DROPPED (infra-only)", low.filter(s => s.hardDrop !== null), 10);

  // Save HIGH + MID for downstream use; LOW is discarded
  const output = {
    high: high.map((s) => s.candidate),
    mid: mid.map((s) => s.candidate),
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nSaved to ${OUTPUT_PATH}`);
  console.log(`  HIGH: ${high.length} candidates`);
  console.log(`  MID : ${mid.length} candidates`);
}

main().catch((err) => {
  console.error("Selection test failed:", err);
  process.exit(1);
});
