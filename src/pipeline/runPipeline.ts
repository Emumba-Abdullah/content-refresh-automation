/**
 * End-to-end pipeline runner: filter new candidates → create PRs.
 *
 * Reads output/final-candidates.json (produced by the classification +
 * post-review steps that run before this script).
 *
 * Environment variables:
 *   DESTINATION_REPO_TOKEN  — required, PAT with repo write access to the destination
 *   PR_IMAGE_PATH           — optional, image path injected into each resource (default: "./img/placeholder.png")
 *   PR_LIMIT                — optional, max PRs to create in this run (default: 1)
 *
 * Outputs:
 *   output/new-candidates.json      — candidates that passed all skip checks
 *   output/skipped-existing.json    — candidates skipped with reason
 *   output/pr-creation-results.json — results for every PR creation attempt
 *
 * Exit codes:
 *   0 — success (zero or more PRs created)
 *   1 — fatal error (token missing, parse failure, etc.)
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { ClassifiedResource } from "../types/resource";
import { filterNewCandidates, SkipReason } from "../process/filterNewCandidates";
import { createDestinationPr, PrCreationResult } from "../github/createDestinationPr";

const INPUT = path.join(process.cwd(), "output", "final-candidates.json");
const OUTPUT_NEW = path.join(process.cwd(), "output", "new-candidates.json");
const OUTPUT_SKIPPED = path.join(process.cwd(), "output", "skipped-existing.json");
const OUTPUT_PR_RESULTS = path.join(process.cwd(), "output", "pr-creation-results.json");

interface PrAttemptResult {
  index: number;
  title: string;
  resourceUrl: string;
  status: "created" | "failed";
  prNumber?: number;
  prUrl?: string;
  branchName?: string;
  error?: string;
}

async function main(): Promise<void> {
  // ── Validate environment ──────────────────────────────────────────────────
  const githubToken = process.env.DESTINATION_REPO_TOKEN;
  if (!githubToken) {
    throw new Error(
      "DESTINATION_REPO_TOKEN is not set. " +
        "Add it to your .env file or set it in GitHub Actions secrets."
    );
  }

  const imagePath = process.env.PR_IMAGE_PATH ?? "./img/placeholder.png";
  const prLimit = parseInt(process.env.PR_LIMIT ?? "1", 10);
  if (isNaN(prLimit) || prLimit < 1) {
    throw new Error(`PR_LIMIT must be a positive integer, got: ${process.env.PR_LIMIT}`);
  }

  // ── Load candidates ───────────────────────────────────────────────────────
  if (!fs.existsSync(INPUT)) {
    throw new Error(
      `${INPUT} not found. Run the classification + post-review steps first.`
    );
  }

  const allCandidates: ClassifiedResource[] = JSON.parse(
    fs.readFileSync(INPUT, "utf-8")
  );
  console.log(`[pipeline] Loaded ${allCandidates.length} candidates from final-candidates.json`);

  // ── Filter: already-in-templates / already-open-pr / previously-rejected ──
  console.log(`[pipeline] Checking against destination repo...`);
  const { newCandidates, skipped, debug } = await filterNewCandidates(
    allCandidates,
    githubToken
  );

  fs.writeFileSync(OUTPUT_NEW, JSON.stringify(newCandidates, null, 2), "utf-8");
  fs.writeFileSync(OUTPUT_SKIPPED, JSON.stringify(skipped, null, 2), "utf-8");

  // Tally skipped by reason
  const tally = new Map<SkipReason, number>();
  for (const s of skipped) {
    tally.set(s.reason, (tally.get(s.reason) ?? 0) + 1);
  }

  console.log(`[pipeline] Filter results:`);
  console.log(`  Total input          : ${allCandidates.length}`);
  console.log(`  Truly new            : ${newCandidates.length}`);
  console.log(`  already-in-templates : ${tally.get("already-in-templates") ?? 0}`);
  console.log(`  already-open-pr      : ${tally.get("already-open-pr") ?? 0}`);
  console.log(`  previously-rejected  : ${tally.get("previously-rejected") ?? 0}`);
  console.log(`  Destination total    : ${debug.totalDestinationTemplates}`);
  console.log();

  if (newCandidates.length === 0) {
    console.log(`[pipeline] No new candidates. Nothing to do.`);
    fs.writeFileSync(OUTPUT_PR_RESULTS, JSON.stringify([], null, 2), "utf-8");
    return;
  }

  // ── Cap to PR_LIMIT ───────────────────────────────────────────────────────
  const batch = newCandidates.slice(0, prLimit);
  if (newCandidates.length > prLimit) {
    console.log(
      `[pipeline] ${newCandidates.length} new candidates available. ` +
        `Processing first ${prLimit} (PR_LIMIT=${prLimit}).`
    );
  }

  // ── Create PRs ────────────────────────────────────────────────────────────
  const results: PrAttemptResult[] = [];

  for (let i = 0; i < batch.length; i++) {
    const candidate = batch[i];
    console.log(
      `[pipeline] Creating PR ${i + 1}/${batch.length}: "${candidate.title}"`
    );

    try {
      const result: PrCreationResult = await createDestinationPr(
        candidate,
        imagePath,
        githubToken
      );
      console.log(`  ✓ PR #${result.prNumber} created: ${result.prUrl}`);
      console.log(`    Branch: ${result.branchName}`);
      results.push({
        index: i,
        title: candidate.title,
        resourceUrl: candidate.website,
        status: "created",
        prNumber: result.prNumber,
        prUrl: result.prUrl,
        branchName: result.branchName,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ Failed: ${message}`);
      results.push({
        index: i,
        title: candidate.title,
        resourceUrl: candidate.website,
        status: "failed",
        error: message,
      });
    }
  }

  fs.writeFileSync(OUTPUT_PR_RESULTS, JSON.stringify(results, null, 2), "utf-8");

  const created = results.filter((r) => r.status === "created").length;
  const failed = results.filter((r) => r.status === "failed").length;

  console.log();
  console.log(`[pipeline] Done. Created: ${created}, Failed: ${failed}`);
  console.log(`[pipeline] Results written to output/pr-creation-results.json`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[pipeline] FATAL:", err.message ?? err);
  process.exit(1);
});
