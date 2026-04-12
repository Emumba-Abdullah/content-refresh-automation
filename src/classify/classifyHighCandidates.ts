import fs from "node:fs";
import path from "node:path";
import { classifyResource } from "./classifyResource";
import { validateResource } from "../validate/resourceValidator";
import { CandidateResource, ClassifiedResource } from "../types/resource";

export type BatchClassificationResult = {
  valid: ClassifiedResource[];
  failed: {
    candidate: CandidateResource;
    error: string;
  }[];
};

export async function classifyHighCandidates(
  candidates: CandidateResource[],
  limit?: number
): Promise<BatchClassificationResult> {
  const valid: ClassifiedResource[] = [];
  const failed: { candidate: CandidateResource; error: string }[] = [];

  const selected = typeof limit === "number" ? candidates.slice(0, limit) : candidates;

  for (let i = 0; i < selected.length; i++) {
    const candidate = selected[i];

    console.log(`\n[${i + 1}/${selected.length}] Classifying: ${candidate.title}`);

    try {
      const classified = await classifyResource(candidate);
      const validation = validateResource(classified);

      if (!validation.valid) {
        failed.push({
          candidate,
          error: `Validation failed: ${validation.errors.join("; ")}`,
        });
        console.log("  → FAIL (validation)");
        continue;
      }

      valid.push(classified);
      console.log(`  → PASS [${classified.priority}] [${classified.tags.join(", ")}]`);
    } catch (error) {
      failed.push({
        candidate,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.log("  → FAIL (exception)");
    }
  }

  return { valid, failed };
}

export function writeBatchResults(result: BatchClassificationResult): void {
  const outputDir = path.resolve(process.cwd(), "output");
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, "classified-valid.json"),
    JSON.stringify(result.valid, null, 2),
    "utf-8"
  );

  fs.writeFileSync(
    path.join(outputDir, "classified-failed.json"),
    JSON.stringify(result.failed, null, 2),
    "utf-8"
  );
}
