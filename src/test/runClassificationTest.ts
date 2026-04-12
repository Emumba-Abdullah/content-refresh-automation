import fs from "node:fs";
import path from "node:path";
import { classifyResource } from "../classify/classifyResource";
import { validateResource } from "../validate/resourceValidator";
import { CandidateResource } from "../types/resource";

const SELECTED_PATH = path.resolve(process.cwd(), "output/selected-candidates.json");
const OUTPUT_PATH = path.resolve(process.cwd(), "output/classified-candidates.json");
const SAMPLE_COUNT = parseInt(process.env.SAMPLE_COUNT ?? "3", 10);

async function main() {
  const raw = fs.readFileSync(SELECTED_PATH, "utf-8");
  const selected = JSON.parse(raw) as { high: CandidateResource[] };

  const candidates = selected.high.slice(0, SAMPLE_COUNT);

  if (candidates.length === 0) {
    throw new Error("No high candidates found in selected-candidates.json");
  }

  console.log(`Classifying ${candidates.length} high-value candidate(s)...\n`);

  const passed: object[] = [];
  const failed: object[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    console.log(`${"=".repeat(70)}`);
    console.log(`[${i + 1}/${candidates.length}] ${candidate.title}`);
    console.log(`URL: ${candidate.website}`);
    console.log();

    try {
      const classified = await classifyResource(candidate);

      console.log("===== CLASSIFIED OUTPUT =====");
      console.log(JSON.stringify(classified, null, 2));

      const validation = validateResource(classified);
      console.log("\n===== VALIDATION =====");
      if (validation.valid) {
        console.log("PASS");
        passed.push(classified);
      } else {
        console.log("FAIL");
        for (const error of validation.errors) {
          console.log(`  - ${error}`);
        }
        failed.push({ candidate, errors: validation.errors, classified });
      }
    } catch (err) {
      console.error(`ERROR classifying candidate ${i + 1}:`, err);
      failed.push({ candidate, error: String(err) });
    }

    console.log();
  }

  const output = { passed, failed };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nSaved to ${OUTPUT_PATH}`);
  console.log(`  Passed: ${passed.length}, Failed: ${failed.length}`);
}

main().catch((err) => {
  console.error("Classification test failed:", err);
  process.exit(1);
});
