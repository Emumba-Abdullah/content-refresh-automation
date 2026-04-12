import * as fs from "fs";
import * as path from "path";
import { ClassifiedResource } from "../types/resource";
import { appendTransformedCandidate } from "../process/appendTransformedCandidate";

const INPUT = path.join(process.cwd(), "output", "new-candidates.json");

// Usage: npx ts-node runAppendTransformedCandidateTest.ts [index] [imagePath]
const indexArg = parseInt(process.argv[2] ?? "0", 10);
const imagePathArg = process.argv[3] ?? "./img/generated-test.png";

const candidates: ClassifiedResource[] = JSON.parse(
  fs.readFileSync(INPUT, "utf-8")
);

if (candidates.length === 0) {
  console.error("new-candidates.json is empty — nothing to append.");
  process.exit(1);
}

if (indexArg < 0 || indexArg >= candidates.length) {
  console.error(
    `Index ${indexArg} out of range. File has ${candidates.length} items (0–${candidates.length - 1}).`
  );
  process.exit(1);
}

const candidate = candidates[indexArg];

console.log(`===== STEP 15: APPEND TRANSFORMED CANDIDATE =====`);
console.log(`Candidate index : ${indexArg} of ${candidates.length}`);
console.log(`Title           : ${candidate.title}`);
console.log(`URL             : ${candidate.website}`);
console.log(`Priority        : ${candidate.priority}`);
console.log(`Tags            : ${candidate.tags?.join(", ")}`);
console.log(`Image path      : ${imagePathArg}`);
console.log();

try {
  const result = appendTransformedCandidate(candidate, imagePathArg);

  console.log(`===== RESULT =====`);
  console.log(`File            : ${result.templateFilePath}`);
  console.log(`Count before    : ${result.countBefore}`);
  console.log(`Count after     : ${result.countAfter}`);
  console.log(`Added           : ${result.countAfter - result.countBefore === 1 ? "YES ✓" : "UNEXPECTED"}`);
  console.log(`JSON valid      : YES ✓`);
  console.log();
  console.log(`Appended object :`);
  console.log(JSON.stringify(result.appended, null, 2));
} catch (err) {
  console.error(`ERROR: ${(err as Error).message}`);
  process.exit(1);
}
