import fs from "node:fs";
import path from "node:path";
import { fetchMicrosoftLearnPostgresCandidates } from "../fetchers/microsoftLearnPostgres";
import { fetchUserProvidedCandidates, parseUserUrls } from "../fetchers/userProvidedUrls";
import { scrapeAllLandingPages } from "../fetchers/scrapeLandingPage";
import { cleanCandidates } from "../process/cleanCandidates";
import { scrapeAll } from "../fetchers/scrapeResourcePage";

const OUTPUT_PATH = path.resolve(process.cwd(), "output/cleaned-candidates.json");
const USER_SUBMITTED_PATH = path.resolve(process.cwd(), "output/user-submitted-urls.json");

// Set USER_URLS_ONLY=true to skip MS Learn + auto-scrape sources and only process
// user-provided URLs from the issue body. Useful for fast local testing.
const USER_URLS_ONLY = process.env.USER_URLS_ONLY === "true";

async function main() {
  const issueBody = process.env.ISSUE_BODY ?? "";
  const userUrls = parseUserUrls(issueBody);
  const userCandidates = await fetchUserProvidedCandidates(userUrls);

  if (userCandidates.length > 0) {
    console.log(`\nMerging ${userCandidates.length} user-provided candidate(s) into the pipeline.`);
    fs.mkdirSync(path.dirname(USER_SUBMITTED_PATH), { recursive: true });
    fs.writeFileSync(
      USER_SUBMITTED_PATH,
      JSON.stringify(userCandidates.map((c) => c.website), null, 2),
      "utf-8"
    );
  }

  let fetched = [...userCandidates];

  if (!USER_URLS_ONLY) {
    console.log("\nFetching Microsoft Learn PostgreSQL candidates...");
    const msLearnCandidates = await fetchMicrosoftLearnPostgresCandidates();
    fetched = [...fetched, ...msLearnCandidates];

    console.log("\nFetching candidates from auto-scrape landing pages...");
    const autoScrapeConfig = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "config/auto-scrape-sources.json"), "utf-8")
    );
    const landingPageStubs = await scrapeAllLandingPages(autoScrapeConfig);
    if (landingPageStubs.length > 0) {
      console.log(`Enriching ${landingPageStubs.length} landing page links via page scrape...`);
      const enriched = await scrapeAll(landingPageStubs, 5);
      fetched = [...fetched, ...enriched];
    }
  } else {
    console.log("\n[USER_URLS_ONLY mode] Skipping MS Learn and auto-scrape sources.");
  }

  const { cleaned, removed } = cleanCandidates(fetched);

  const reasonCounts = removed.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  console.log("\n===== CLEANING SUMMARY =====");
  console.log(`Fetched: ${fetched.length}`);
  console.log(`Cleaned: ${cleaned.length}`);
  console.log(`Removed: ${removed.length}`);

  console.log("\n===== REMOVAL REASONS =====");
  for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`${reason}: ${count}`);
  }

  console.log("\n===== FIRST 10 CLEANED CANDIDATES =====");
  cleaned.slice(0, 10).forEach((candidate, index) => {
    console.log("\n------------------------------------");
    console.log(`#${index + 1}`);
    console.log(`Title: ${candidate.title}`);
    console.log(`Description: ${candidate.description}`);
    console.log(`Website: ${candidate.website}`);
    console.log(`Date: ${candidate.date ?? "[none]"}`);
  });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cleaned, null, 2), "utf-8");
  console.log(`\nSaved ${cleaned.length} cleaned candidates -> ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("Cleaning test failed:");
  console.error(error);
  process.exit(1);
});
