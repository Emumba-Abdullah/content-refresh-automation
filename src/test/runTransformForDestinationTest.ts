import * as fs from "fs";
import * as path from "path";
import { ClassifiedResource } from "../types/resource";
import { transformForDestination } from "../process/transformForDestination";

const INPUT = path.join(process.cwd(), "output", "new-candidates.json");

// Usage: npx ts-node runTransformForDestinationTest.ts [index] [imagePath]
const indexArg = parseInt(process.argv[2] ?? "0", 10);
const imagePathArg = process.argv[3] ?? "./img/placeholder.png";

const candidates: ClassifiedResource[] = JSON.parse(
  fs.readFileSync(INPUT, "utf-8")
);

if (candidates.length === 0) {
  console.error("new-candidates.json is empty.");
  process.exit(1);
}

if (indexArg < 0 || indexArg >= candidates.length) {
  console.error(
    `Index ${indexArg} out of range. File has ${candidates.length} items (0–${candidates.length - 1}).`
  );
  process.exit(1);
}

const candidate = candidates[indexArg];

console.log(`===== STEP: TRANSFORM FOR DESTINATION =====`);
console.log(`Candidate index : ${indexArg}`);
console.log(`Image path      : ${imagePathArg}`);
console.log();

console.log(`--- INPUT (ClassifiedResource) ---`);
console.log(JSON.stringify(candidate, null, 2));
console.log();

const result = transformForDestination(candidate, imagePathArg);

console.log(`--- OUTPUT (destination-ready Resource) ---`);
console.log(JSON.stringify(result, null, 2));
console.log();

// Verify stripped fields
const stripped: string[] = [];
if (!("confidence" in result)) stripped.push("confidence");
if (!("reasoning" in result)) stripped.push("reasoning");
console.log(`Stripped fields : ${stripped.join(", ") || "none"}`);

// Verify required fields present
const required = ["title", "description", "website", "source", "image", "tags", "priority"];
const missing = required.filter((f) => !(f in result));
if (missing.length > 0) {
  console.error(`MISSING required fields: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`Required fields : all present ✓`);
