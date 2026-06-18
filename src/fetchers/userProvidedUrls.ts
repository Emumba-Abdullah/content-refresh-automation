import { CandidateResource } from "../types/resource";
import { scrapeResourcePage } from "./scrapeResourcePage";

export function parseUserUrls(issueBody: string): string[] {
  const match = issueBody.match(/### Additional URLs[\r\n]+([\s\S]*?)(?:[\r\n]+###|$)/);
  if (!match) return [];
  return match[1]
    .trim()
    .split(/[\r\n]+/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"));
}

export async function fetchUserProvidedCandidates(
  urls: string[]
): Promise<CandidateResource[]> {
  if (urls.length === 0) return [];

  console.log(`Scraping ${urls.length} user-provided URL(s)...`);
  const results: CandidateResource[] = [];

  for (const url of urls) {
    const stub: CandidateResource = {
      title: url,
      description: "",
      website: url,
      source: "user-submitted",
      userSubmitted: true,
    };
    const scraped = await scrapeResourcePage(stub);
    results.push({ ...scraped, source: "user-submitted", userSubmitted: true });
  }

  return results;
}
