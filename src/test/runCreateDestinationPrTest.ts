import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { ClassifiedResource } from "../types/resource";
import { createDestinationPr } from "../github/createDestinationPr";
import { buildBranchName } from "../github/buildBranchName";
import { buildPrBody } from "../github/buildPrBody";
import { transformForDestination } from "../process/transformForDestination";

const INPUT = path.join(process.cwd(), "output", "new-candidates.json");

// Usage: npx ts-node runCreateDestinationPrTest.ts [index] [imagePath]
const indexArg = parseInt(process.argv[2] ?? "0", 10);
const imagePathArg = process.argv[3] ?? "./img/generated-test.png";

async function main() {
  const githubToken = process.env.DESTINATION_REPO_TOKEN;
  if (!githubToken) {
    throw new Error("DESTINATION_REPO_TOKEN is not set. Add it to your .env file.");
  }

  const candidates: ClassifiedResource[] = JSON.parse(
    fs.readFileSync(INPUT, "utf-8")
  );

  if (candidates.length === 0) {
    throw new Error("new-candidates.json is empty — nothing to create a PR for.");
  }

  if (indexArg < 0 || indexArg >= candidates.length) {
    throw new Error(
      `Index ${indexArg} out of range. File has ${candidates.length} items (0–${candidates.length - 1}).`
    );
  }

  const candidate = candidates[indexArg];

  // Preview what will be created — no remote calls yet
  const preview = transformForDestination(candidate, imagePathArg);
  const branchPreview = buildBranchName(preview.website);
  const bodyPreview = buildPrBody(preview);

  console.log(`===== STEP 16: CREATE DESTINATION PR =====`);
  console.log(`Candidate index : ${indexArg} of ${candidates.length}`);
  console.log(`Title           : ${candidate.title}`);
  console.log(`URL             : ${candidate.website}`);
  console.log(`Priority        : ${candidate.priority}`);
  console.log(`Image path      : ${imagePathArg}`);
  console.log(`Branch name     : ${branchPreview}`);
  console.log();
  console.log(`PR body preview:`);
  console.log(`---`);
  console.log(bodyPreview);
  console.log(`---`);
  console.log();
  console.log(`Creating remote branch, committing, and opening PR...`);
  console.log();

  const result = await createDestinationPr(candidate, imagePathArg, githubToken);

  console.log(`===== RESULT =====`);
  console.log(`Branch          : ${result.branchName}`);
  console.log(`PR number       : #${result.prNumber}`);
  console.log(`PR URL          : ${result.prUrl}`);
  console.log(`Title           : ${result.title}`);
  console.log(`Resource URL    : ${result.resourceUrl}`);
  console.log(`Label added     : needs-review`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
