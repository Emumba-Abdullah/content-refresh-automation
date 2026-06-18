import fs from "node:fs";
import path from "node:path";
import { CandidateResource } from "../types/resource";
import { normalizeUrl } from "../utils/normalizeUrl";

type FilterRules = {
  addTitleContains: string[];
  dropUrlContains: string[];
  requireNonEmptyDescription: boolean;
};

export type RemovedCandidate = {
  candidate: CandidateResource;
  reason: string;
};

export type CleanCandidatesResult = {
  cleaned: CandidateResource[];
  removed: RemovedCandidate[];
};

function readJsonFile<T>(relativePath: string): T {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const content = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(content) as T;
}

const filterRules = readJsonFile<FilterRules>("config/filter-rules.json");

function hasBrokenUrl(url: string): boolean {
  if (!url?.trim()) return true;
  try {
    const parsed = new URL(url.trim());
    return !parsed.protocol.startsWith("http");
  } catch {
    return true;
  }
}

function titlePassesWhitelist(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return filterRules.addTitleContains.some((phrase) =>
    normalized.includes(phrase.toLowerCase())
  );
}

function urlMatchesDropRule(url: string): string | null {
  const normalized = url.trim().toLowerCase();
  for (const phrase of filterRules.dropUrlContains) {
    if (normalized.includes(phrase.toLowerCase())) {
      return `Dropped by URL rule: "${phrase}"`;
    }
  }
  return null;
}

export function cleanCandidates(
  candidates: CandidateResource[]
): CleanCandidatesResult {
  const cleaned: CandidateResource[] = [];
  const removed: RemovedCandidate[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    const candidate: CandidateResource = {
      title: raw.title?.trim() ?? "",
      description: raw.description?.trim() ?? "",
      website: raw.website?.trim() ?? "",
      source: raw.source?.trim() ?? "",
      date: raw.date?.trim() ?? undefined,
      userSubmitted: raw.userSubmitted,
    };

    const isUserSubmitted = candidate.userSubmitted === true;

    if (!candidate.title) {
      removed.push({ candidate, reason: "Missing title" });
      continue;
    }

    if (!candidate.website || !candidate.source) {
      removed.push({ candidate, reason: "Missing website or source" });
      continue;
    }

    if (hasBrokenUrl(candidate.website) || hasBrokenUrl(candidate.source)) {
      removed.push({ candidate, reason: "Broken or invalid URL" });
      continue;
    }

    const websiteDropReason = urlMatchesDropRule(candidate.website);
    if (websiteDropReason) {
      removed.push({ candidate, reason: websiteDropReason });
      continue;
    }

    // User-submitted URLs bypass the title whitelist and description requirement —
    // the user explicitly chose them so no keyword gating applies.
    if (!isUserSubmitted) {
      if (!titlePassesWhitelist(candidate.title)) {
        removed.push({ candidate, reason: "Title does not match any addTitleContains keyword" });
        continue;
      }

      if (filterRules.requireNonEmptyDescription && !candidate.description?.trim()) {
        removed.push({ candidate, reason: "Empty description" });
        continue;
      }
    }

    const normalizedUrl = normalizeUrl(candidate.website);

    if (seen.has(normalizedUrl)) {
      removed.push({ candidate, reason: "Duplicate normalized URL" });
      continue;
    }

    seen.add(normalizedUrl);

    cleaned.push({
      ...candidate,
      website: normalizedUrl,
      source: normalizeUrl(candidate.source),
    });
  }

  return { cleaned, removed };
}