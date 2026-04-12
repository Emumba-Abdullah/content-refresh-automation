import * as fs from "fs";
import * as path from "path";
import fetch, { Response } from "node-fetch";
import { normalizeUrl } from "../utils/normalizeUrl";

interface DestinationRepoConfig {
  owner: string;
  repo: string;
  baseBranch: string;
  templatePath: string;
  rejectedLabel: string;
}

function loadConfig(): DestinationRepoConfig {
  const configPath = path.join(process.cwd(), "config", "destination-repo.json");
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

interface GitHubIssueOrPR {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: Array<{ name: string }>;
  pull_request?: {
    url: string;
  };
}

/**
 * Convention: when a PR is created for a resource, its body must contain
 * the marker line:  resource-url: <normalized-url>
 * This function extracts that URL from a PR body.
 */
function extractUrlFromPrBody(body: string | null): string | null {
  if (!body) return null;
  const match = body.match(/resource-url:\s*(https?:\/\/\S+)/i);
  return match ? normalizeUrl(match[1].trim()) : null;
}

async function fetchAllPages<T>(
  baseUrl: string,
  headers: Record<string, string>
): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = baseUrl;

  while (url) {
    const res: Response = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`GitHub API error at ${url}: ${res.status} ${res.statusText}`);
    }

    const page = (await res.json()) as T[];
    results.push(...page);

    // Follow GitHub Link header pagination
    const link: string | null = res.headers.get("link");
    const nextMatch: RegExpMatchArray | null = link
      ? link.match(/<([^>]+)>;\s*rel="next"/)
      : null;
    url = nextMatch ? nextMatch[1] : null;
  }

  return results;
}

export type ExistingState = "already-open-pr" | "previously-rejected";

/**
 * Returns a map of normalizedUrl -> ExistingState for any candidate URL
 * that already has an open PR or a previously-rejected PR in the destination repo.
 *
 * Only checks against the provided candidateUrls set — does not scan all PRs
 * for unrelated content.
 */
export async function findExistingResourceState(
  candidateUrls: Set<string>,
  githubToken: string
): Promise<Map<string, ExistingState>> {
  const { owner, repo, rejectedLabel } = loadConfig();

  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "content-refresh-automation",
  };

  const result = new Map<string, ExistingState>();

  // Fetch all open PRs (pulls endpoint only returns PRs, never plain issues)
  const openPrs = await fetchAllPages<GitHubIssueOrPR>(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
    headers
  );

  for (const pr of openPrs) {
    const url = extractUrlFromPrBody(pr.body);
    if (url && candidateUrls.has(url)) {
      result.set(url, "already-open-pr");
    }
  }

  // Fetch closed items labeled resource-rejected.
  // The issues endpoint returns both issues and PRs — only treat as rejected
  // if the item has a pull_request field (i.e. it is actually a PR).
  const rejectedItems = await fetchAllPages<GitHubIssueOrPR>(
    `https://api.github.com/repos/${owner}/${repo}/issues?state=closed&labels=${encodeURIComponent(rejectedLabel)}&per_page=100`,
    headers
  );

  for (const item of rejectedItems) {
    if (!item.pull_request) continue; // skip plain issues
    const url = extractUrlFromPrBody(item.body);
    if (url && candidateUrls.has(url)) {
      // Don't overwrite already-open-pr (shouldn't happen, but be safe)
      if (!result.has(url)) {
        result.set(url, "previously-rejected");
      }
    }
  }

  return result;
}
