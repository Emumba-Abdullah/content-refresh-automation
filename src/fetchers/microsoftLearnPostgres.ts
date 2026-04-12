import fetch from "node-fetch";
import fs from "node:fs";
import path from "node:path";
import { CandidateResource } from "../types/resource";
import { scrapeAll } from "./scrapeResourcePage";

const TOC_URL = "https://learn.microsoft.com/en-us/azure/postgresql/toc.json";
const BASE_DOC_URL = "https://learn.microsoft.com/en-us/azure/postgresql";

type TocItem = {
  toc_title?: string;
  href?: string;
  children?: TocItem[] | string;
};

function isLeafNode(item: TocItem): boolean {
  return !Array.isArray(item.children);
}

function collectLeafItems(items: TocItem[], results: CandidateResource[]): void {
  for (const item of items) {
    if (item.href && item.toc_title) {
      const href = item.href.trim();

      // Skip root/anchor-only entries
      if (href === "./" || href.startsWith("#")) {
        if (Array.isArray(item.children)) collectLeafItems(item.children, results);
        continue;
      }

      // Only collect leaf nodes (actual article pages, not category landing pages)
      if (isLeafNode(item)) {
        const url = href.startsWith("http")
          ? href
          : `${BASE_DOC_URL}/${href}`;

        results.push({
          title: item.toc_title.trim(),
          description: "",
          website: url,
          source: url,
        });
      }
    }

    if (Array.isArray(item.children)) {
      collectLeafItems(item.children, results);
    }
  }
}

export async function fetchMicrosoftLearnPostgres(): Promise<CandidateResource[]> {
  const response = await fetch(TOC_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; content-refresh-bot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch TOC: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { items: TocItem[] };
  const candidates: CandidateResource[] = [];
  collectLeafItems(data.items, candidates);
  return candidates;
}

const ENRICHED_CACHE = path.resolve(process.cwd(), "output/enriched-candidates.json");

/**
 * Returns enriched candidates (title, description, date populated).
 * Loads from the cached output/enriched-candidates.json when available,
 * otherwise falls back to a live TOC fetch + page scrape.
 */
export async function fetchMicrosoftLearnPostgresCandidates(): Promise<CandidateResource[]> {
  if (fs.existsSync(ENRICHED_CACHE)) {
    const raw = fs.readFileSync(ENRICHED_CACHE, "utf-8");
    return JSON.parse(raw) as CandidateResource[];
  }

  console.log("No cache found — running live fetch + scrape...");
  const tocCandidates = await fetchMicrosoftLearnPostgres();
  return scrapeAll(tocCandidates, 5);
}
