import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { CandidateResource } from "../types/resource";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; content-refresh-bot/1.0)",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function scrapeResourcePage(
  candidate: CandidateResource
): Promise<CandidateResource> {
  let html: string;

  try {
    const response = await fetch(candidate.website, { headers: HEADERS });
    if (!response.ok) {
      return candidate;
    }
    html = await response.text();
  } catch {
    return candidate;
  }

  const $ = cheerio.load(html);

  // Title: prefer the article h1, fall back to <title>
  const title =
    $("h1").first().text().trim() ||
    $("title").first().text().replace(/\s*\|.*$/, "").trim() ||
    candidate.title;

  // Description: meta description tag
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    "";

  // Date: <local-time data-article-date-source="calculated" datetime="YYYY-MM-DDT...">
  let date = "";
  const localTime = $("local-time[data-article-date-source]");
  if (localTime.length) {
    // Prefer the datetime attribute (full ISO), fall back to text content
    const dt = localTime.attr("datetime") ?? localTime.text().trim();
    date = dt ? dt.slice(0, 10) : ""; // keep YYYY-MM-DD only
  }

  // Fallback: scan for "Last updated" text pattern anywhere on the page
  if (!date) {
    const bodyText = $("body").text();
    const match = bodyText.match(/last\s+updated[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    if (match) {
      // Convert MM/DD/YYYY → YYYY-MM-DD
      const [mm, dd, yyyy] = match[1].split("/");
      date = `${yyyy}-${mm}-${dd}`;
    }
  }

  return {
    title,
    description,
    website: candidate.website,
    source: candidate.source,
    ...(date ? { date } : {}),
  };
}

export async function scrapeAll(
  candidates: CandidateResource[],
  concurrency = 5,
  onProgress?: (done: number, total: number) => void
): Promise<CandidateResource[]> {
  const results: CandidateResource[] = new Array(candidates.length);
  let index = 0;
  let done = 0;
  const total = candidates.length;

  async function worker() {
    while (index < total) {
      const i = index++;
      results[i] = await scrapeResourcePage(candidates[i]);
      done++;
      onProgress?.(done, total);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}
