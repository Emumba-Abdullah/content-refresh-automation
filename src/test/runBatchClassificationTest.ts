import fs from "node:fs";
import path from "node:path";
import { classifyHighCandidates, writeBatchResults } from "../classify/classifyHighCandidates";
import { CandidateResource } from "../types/resource";

const SELECTED_PATH = path.resolve(process.cwd(), "output/selected-candidates.json");

function loadHighCandidates(): CandidateResource[] {
  const raw = fs.readFileSync(SELECTED_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return (parsed.high ?? []) as CandidateResource[];
}

async function main() {
  const highCandidates = loadHighCandidates();
  console.log(`Loaded ${highCandidates.length} high candidates.\n`);

  const limit = process.argv[2] ? Number(process.argv[2]) : 5;
  console.log(`Running batch classification for first ${limit} candidates...`);

  const result = await classifyHighCandidates(highCandidates, limit);

  writeBatchResults(result);

  console.log("\n===== SUMMARY =====");
  console.log(`Attempted : ${Math.min(limit, highCandidates.length)}`);
  console.log(`Valid     : ${result.valid.length}`);
  console.log(`Failed    : ${result.failed.length}`);

  if (result.failed.length > 0) {
    console.log("\n===== FAILED ITEMS =====");
    result.failed.forEach((item, i) => {
      console.log(`\n${i + 1}. ${item.candidate.title}`);
      console.log(`   Reason: ${item.error}`);
    });
  }

  if (result.valid.length > 0) {
    console.log("\n===== SAMPLE (first valid) =====");
    const sample = result.valid[0];
    console.log(`Title    : ${sample.title}`);
    console.log(`Tags     : ${sample.tags.join(", ")}`);
    console.log(`Priority : ${sample.priority}`);
    console.log(`Conf.    : ${sample.confidence}`);
    console.log(`Reasoning: ${sample.reasoning}`);
    if (sample.learningPathTitle) {
      console.log(`LP Title : ${sample.learningPathTitle}`);
    }
  }

  console.log("\nResults written to:");
  console.log("  output/classified-valid.json");
  console.log("  output/classified-failed.json");
}

main().catch((err) => {
  console.error("Batch classification failed:", err);
  process.exit(1);
});
