import * as fs from "fs";
import * as path from "path";
import { ClassifiedResource } from "../types/resource";

function loadUserSubmittedUrls(): Set<string> {
  const filePath = path.join(process.cwd(), "output", "user-submitted-urls.json");
  if (!fs.existsSync(filePath)) return new Set();
  try {
    const urls: string[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return new Set(urls);
  } catch {
    return new Set();
  }
}

interface DomainRule {
  domain: string;
  reason: string;
}

interface UrlPatternRule {
  pattern: string;
  reason: string;
}

interface ReviewConfig {
  dropDomains: DomainRule[];
  dropUrlContains: UrlPatternRule[];
}

export interface DroppedItem {
  title: string;
  website: string;
  reason: string;
}

export interface ReviewResult {
  kept: ClassifiedResource[];
  dropped: DroppedItem[];
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function runPostClassificationReview(
  candidates: ClassifiedResource[]
): ReviewResult {
  const configPath = path.join(process.cwd(), "config", "post-classification-review.json");
  const config: ReviewConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const userSubmittedUrls = loadUserSubmittedUrls();

  const kept: ClassifiedResource[] = [];
  const dropped: DroppedItem[] = [];

  for (const item of candidates) {
    const url = item.website ?? "";
    const hostname = getHostname(url);

    // User-submitted URLs bypass automated domain/URL-pattern drop rules —
    // the user explicitly requested them and may intentionally link non-Learn domains.
    if (userSubmittedUrls.has(url)) {
      kept.push(item);
      continue;
    }

    const domainMatch = config.dropDomains.find((r) => hostname === r.domain);
    if (domainMatch) {
      dropped.push({ title: item.title, website: url, reason: domainMatch.reason });
      continue;
    }

    const patternMatch = config.dropUrlContains.find((r) => url.includes(r.pattern));
    if (patternMatch) {
      dropped.push({ title: item.title, website: url, reason: patternMatch.reason });
      continue;
    }

    kept.push(item);
  }

  return { kept, dropped };
}
