import { ClassifiedResource } from "../types/resource";
import { normalizeUrl } from "../utils/normalizeUrl";
import { canonicalKey } from "../utils/canonicalKey";
import { loadDestinationTemplates } from "../github/loadDestinationTemplates";
import { findExistingResourceState, ExistingState } from "../github/findExistingResourceState";

export type SkipReason = "already-in-templates" | "already-in-templates-canonical" | ExistingState;

export interface SkippedCandidate {
  title: string;
  website: string;
  reason: SkipReason;
  matchedKey?: string; // the key that triggered the match, for debug
}

export interface FilterResult {
  newCandidates: ClassifiedResource[];
  skipped: SkippedCandidate[];
  debug: {
    totalDestinationTemplates: number;
    exactUrlMatches: number;
    canonicalKeyMatches: number;
    prStateMatches: number;
  };
}

/**
 * Filters the given candidates against the destination repo to produce
 * only truly new candidates. Does not create PRs, branches, or commits.
 *
 * Matching strategy (in order):
 *   1. Exact normalized URL match against destination templates.json
 *   2. Canonical identity key match (handles locale strips, subdir changes)
 *   3. Open PR check (by resource-url marker in PR body)
 *   4. Previously-rejected PR check (labeled resource-rejected)
 */
export async function filterNewCandidates(
  candidates: ClassifiedResource[],
  githubToken: string
): Promise<FilterResult> {
  // Build normalized candidate URL map with duplicate detection
  const candidateUrlMap = new Map<string, ClassifiedResource>();
  for (const c of candidates) {
    if (c.website) {
      const key = normalizeUrl(c.website);
      if (candidateUrlMap.has(key)) {
        console.warn(
          `[filterNewCandidates] Duplicate normalized URL detected — pipeline weakness upstream:\n  ${key}\n  Keeping first occurrence, dropping: "${c.title}"`
        );
      } else {
        candidateUrlMap.set(key, c);
      }
    }
  }
  const candidateUrls = new Set(candidateUrlMap.keys());

  // Load destination state
  const { normalizedUrls: existingNormalized, canonicalKeys: existingCanonical } =
    await loadDestinationTemplates(githubToken);

  const prStateMap = await findExistingResourceState(candidateUrls, githubToken);

  // Filter
  const newCandidates: ClassifiedResource[] = [];
  const skipped: SkippedCandidate[] = [];
  let exactUrlMatches = 0;
  let canonicalKeyMatches = 0;
  let prStateMatches = 0;

  for (const [normalizedUrl, candidate] of candidateUrlMap) {
    // 1. Exact URL match
    if (existingNormalized.has(normalizedUrl)) {
      exactUrlMatches++;
      skipped.push({
        title: candidate.title,
        website: candidate.website,
        reason: "already-in-templates",
        matchedKey: normalizedUrl,
      });
      continue;
    }

    // 2. Canonical identity key match
    const ck = canonicalKey(candidate.website);
    if (ck && existingCanonical.has(ck)) {
      canonicalKeyMatches++;
      skipped.push({
        title: candidate.title,
        website: candidate.website,
        reason: "already-in-templates-canonical",
        matchedKey: ck,
      });
      continue;
    }

    // 3. Open PR or previously-rejected PR
    const prState = prStateMap.get(normalizedUrl);
    if (prState) {
      prStateMatches++;
      skipped.push({
        title: candidate.title,
        website: candidate.website,
        reason: prState,
        matchedKey: normalizedUrl,
      });
      continue;
    }

    newCandidates.push(candidate);
  }

  return {
    newCandidates,
    skipped,
    debug: {
      totalDestinationTemplates: existingNormalized.size,
      exactUrlMatches,
      canonicalKeyMatches,
      prStateMatches,
    },
  };
}

