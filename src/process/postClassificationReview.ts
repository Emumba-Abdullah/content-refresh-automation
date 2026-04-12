import * as fs from "fs";
import * as path from "path";
import { ClassifiedResource } from "../types/resource";

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

  const kept: ClassifiedResource[] = [];
  const dropped: DroppedItem[] = [];

  for (const item of candidates) {
    const url = item.website ?? "";
    const hostname = getHostname(url);

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
