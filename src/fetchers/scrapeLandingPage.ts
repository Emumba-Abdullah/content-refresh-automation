import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { CandidateResource } from "../types/resource";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; content-refresh-bot/1.0)",
  "Accept-Language": "en-US,en;q=0.9",
};

type AutoScrapeSource = {
  name: string;
  url: string;
  linkPattern: string;
};

export async function scrapeLandingPage(
  source: AutoScrapeSource
): Promise<CandidateResource[]> {
  let html: string;
  try {
    const response = await fetch(source.url, { headers: HEADERS });
    if (!response.ok) {
      console.warn(`[${source.name}] Failed to fetch landing page: ${response.status}`);
      return [];
    }
    html = await response.text();
  } catch (err) {
    console.warn(`[${source.name}] Error fetching landing page:`, err);
    return [];
  }

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const candidates: CandidateResource[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const linkText = $(el).text().trim();

    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, source.url).href;
    } catch {
      return;
    }

    // Strip query params and fragments for dedup — keep the clean article URL
    try {
      const parsed = new URL(absoluteUrl);
      parsed.search = "";
      parsed.hash = "";
      absoluteUrl = parsed.href;
    } catch {
      return;
    }

    if (!absoluteUrl.includes(source.linkPattern)) return;
    if (seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);

    candidates.push({
      title: linkText || absoluteUrl,
      description: "",
      website: absoluteUrl,
      source: absoluteUrl,
    });
  });

  console.log(`[${source.name}] Extracted ${candidates.length} candidate links.`);
  return candidates;
}

export async function scrapeAllLandingPages(
  sources: AutoScrapeSource[]
): Promise<CandidateResource[]> {
  const results = await Promise.all(sources.map((s) => scrapeLandingPage(s)));
  return results.flat();
}
