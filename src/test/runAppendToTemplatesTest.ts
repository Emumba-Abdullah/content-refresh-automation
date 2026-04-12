import * as fs from "fs";
import * as path from "path";
import { ClassifiedResource } from "../types/resource";
import { appendToTemplates } from "../process/appendToTemplates";

const INPUT = path.join(process.cwd(), "output", "new-candidates.json");

// Support optional index argument: npx ts-node runAppendToTemplatesTest.ts [index]
const indexArg = parseInt(process.argv[2] ?? "0", 10);

const candidates: ClassifiedResource[] = JSON.parse(
  fs.readFileSync(INPUT, "utf-8")
);

if (candidates.length === 0) {
  console.error("new-candidates.json is empty — nothing to append.");
  process.exit(1);
}

if (indexArg < 0 || indexArg >= candidates.length) {
  console.error(
    `Index ${indexArg} is out of range. new-candidates.json has ${candidates.length} items (0–${candidates.length - 1}).`
  );
  process.exit(1);
}

const candidate = candidates[indexArg];

console.log(`===== STEP 14: APPEND TO TEMPLATES =====`);
console.log(`Source          : ${INPUT}`);
console.log(`Candidate index : ${indexArg} of ${candidates.length}`);
console.log(`Title           : ${candidate.title}`);
console.log(`URL             : ${candidate.website}`);
console.log(`Priority        : ${candidate.priority}`);
console.log(`Tags            : ${candidate.tags?.join(", ")}`);
console.log();

try {
  const result = appendToTemplates(candidate);

  console.log(`===== RESULT =====`);
  console.log(`File            : ${result.templateFilePath}`);
  console.log(`Count before    : ${result.countBefore}`);
  console.log(`Count after     : ${result.countAfter}`);
  console.log(`Added           : ${result.countAfter - result.countBefore === 1 ? "YES ✓" : "UNEXPECTED"}`);
  console.log(`JSON valid      : YES ✓`);
} catch (err) {
  console.error(`ERROR: ${(err as Error).message}`);
  process.exit(1);
}
