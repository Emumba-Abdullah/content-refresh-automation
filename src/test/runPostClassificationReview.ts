import * as fs from "fs";
import * as path from "path";
import { runPostClassificationReview } from "../process/postClassificationReview";
import { ClassifiedResource } from "../types/resource";

const INPUT = path.join(process.cwd(), "output", "classified-valid.json");
const OUTPUT_FINAL = path.join(process.cwd(), "output", "final-candidates.json");
const OUTPUT_DROPPED = path.join(process.cwd(), "output", "dropped-after-review.json");

const raw = fs.readFileSync(INPUT, "utf-8");
const candidates: ClassifiedResource[] = JSON.parse(raw);

const { kept, dropped } = runPostClassificationReview(candidates);

fs.writeFileSync(OUTPUT_FINAL, JSON.stringify(kept, null, 2), "utf-8");
fs.writeFileSync(OUTPUT_DROPPED, JSON.stringify(dropped, null, 2), "utf-8");

console.log(`===== POST-CLASSIFICATION REVIEW =====`);
console.log(`Input    : ${candidates.length} items`);
console.log(`Kept     : ${kept.length}`);
console.log(`Dropped  : ${dropped.length}`);
console.log(``);
console.log(`Dropped items:`);
for (const d of dropped) {
  console.log(`  - ${d.title}`);
  console.log(`    URL   : ${d.website}`);
  console.log(`    Reason: ${d.reason}`);
}
console.log(``);
console.log(`Written:`);
console.log(`  ${OUTPUT_FINAL}`);
console.log(`  ${OUTPUT_DROPPED}`);
