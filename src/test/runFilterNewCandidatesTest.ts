import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { ClassifiedResource } from "../types/resource";
import { filterNewCandidates, SkipReason } from "../process/filterNewCandidates";

const INPUT = path.join(process.cwd(), "output", "final-candidates.json");
const OUTPUT_NEW = path.join(process.cwd(), "output", "new-candidates.json");
const OUTPUT_SKIPPED = path.join(process.cwd(), "output", "skipped-existing.json");

async function main() {
  const githubToken = process.env.DESTINATION_REPO_TOKEN;
  if (!githubToken) {
    throw new Error("DESTINATION_REPO_TOKEN is not set. Add it to your .env file.");
  }

  const candidates: ClassifiedResource[] = JSON.parse(
    fs.readFileSync(INPUT, "utf-8")
  );
  console.log(`Loaded ${candidates.length} candidates from final-candidates.json`);
  console.log(`Comparing against destination repo...`);
  console.log();

  const { newCandidates, skipped, debug } = await filterNewCandidates(candidates, githubToken);

  fs.writeFileSync(OUTPUT_NEW, JSON.stringify(newCandidates, null, 2), "utf-8");
  fs.writeFileSync(OUTPUT_SKIPPED, JSON.stringify(skipped, null, 2), "utf-8");

  // Tally skipped by reason
  const tally = new Map<SkipReason, number>();
  for (const s of skipped) {
    tally.set(s.reason, (tally.get(s.reason) ?? 0) + 1);
  }

  console.log(`===== FILTER RESULTS =====`);
  console.log(`Input           : ${candidates.length}`);
  console.log(`New             : ${newCandidates.length}`);
  console.log(`Skipped         : ${skipped.length}`);
  console.log();
  console.log(`Skipped breakdown:`);
  const reasons: SkipReason[] = [
    "already-in-templates",
    "already-open-pr",
    "previously-rejected",
  ];
  for (const reason of reasons) {
    const count = tally.get(reason) ?? 0;
    if (count > 0) {
      console.log(`  ${reason.padEnd(26)}: ${count}`);
    }
  }
  console.log();
  console.log(`===== DEBUG: MATCH BREAKDOWN =====`);
  console.log(`Destination templates loaded : ${debug.totalDestinationTemplates}`);
  console.log(`Exact URL matches            : ${debug.exactUrlMatches}`);
  console.log(`Canonical key matches        : ${debug.canonicalKeyMatches}`);
  console.log(`PR state matches             : ${debug.prStateMatches}`);
  if (debug.canonicalKeyMatches > 0) {
    console.log();
    console.log(`Canonical-only matches (same article, different URL shape):`);
    for (const s of skipped.filter((x) => x.reason === "already-in-templates" && x.matchedKey && !x.matchedKey.startsWith("https"))) {
      console.log(`  "${s.title}"`);
      console.log(`    candidate URL: ${s.website}`);
      console.log(`    canonical key: ${s.matchedKey}`);
    }
  }
  console.log();
  console.log(`Written:`);
  console.log(`  ${OUTPUT_NEW}`);
  console.log(`  ${OUTPUT_SKIPPED}`);
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});

