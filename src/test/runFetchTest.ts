import fs from "node:fs";
import path from "node:path";
import { fetchMicrosoftLearnPostgres } from "../fetchers/microsoftLearnPostgres";
import { scrapeAll } from "../fetchers/scrapeResourcePage";

const SCRAPE_LIMIT = parseInt(process.env.SCRAPE_LIMIT ?? "0", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "5", 10);
const TOC_OUTPUT = path.resolve(process.cwd(), "output/fetched-candidates.json");
const ENRICHED_OUTPUT = path.resolve(process.cwd(), "output/enriched-candidates.json");

async function main() {
  // Step 1: fetch leaf nodes from TOC
  console.log("Fetching leaf nodes from Microsoft Learn TOC (PostgreSQL)...");
  const allCandidates = await fetchMicrosoftLearnPostgres();
  console.log(`Total leaf candidates: ${allCandidates.length}`);

  fs.mkdirSync(path.dirname(TOC_OUTPUT), { recursive: true });
  fs.writeFileSync(TOC_OUTPUT, JSON.stringify(allCandidates, null, 2), "utf-8");
  console.log(`Saved TOC candidates -> ${TOC_OUTPUT}\n`);

  // Step 2: scrape each page for title, description, date
  const targets = SCRAPE_LIMIT > 0 ? allCandidates.slice(0, SCRAPE_LIMIT) : allCandidates;
  console.log(`Scraping ${targets.length} pages (concurrency=${CONCURRENCY})...`);

  let lastLogged = 0;
  const enriched = await scrapeAll(targets, CONCURRENCY, (done, total) => {
    if (done - lastLogged >= 10 || done === total) {
      process.stdout.write(`  ${done}/${total}\r`);
      lastLogged = done;
    }
  });

  console.log("\n\nFirst 5 enriched results:");
  console.log("=".repeat(70));
  for (const r of enriched.slice(0, 5)) {
    console.log(`Title       : ${r.title}`);
    console.log(`Description : ${r.description?.slice(0, 120)}...`);
    console.log(`Date        : ${r.date ?? "(not found)"}`);
    console.log(`URL         : ${r.website}`);
    console.log("-".repeat(70));
  }

  fs.writeFileSync(ENRICHED_OUTPUT, JSON.stringify(enriched, null, 2), "utf-8");
  console.log(`\nSaved ${enriched.length} enriched candidates -> ${ENRICHED_OUTPUT}`);
}

main().catch((err) => {
  console.error("Fetch test failed:", err);
  process.exit(1);
});