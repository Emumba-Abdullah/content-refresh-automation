import * as fs from "fs";
import * as path from "path";
import fetch, { Response } from "node-fetch";
import { ClassifiedResource, Resource } from "../types/resource";
import { transformForDestination } from "../process/transformForDestination";
import { buildBranchName } from "./buildBranchName";
import { buildPrBody } from "./buildPrBody";

interface DestinationRepoConfig {
  owner: string;
  forkOwner?: string;
  repo: string;
  baseBranch: string;
  templatePath: string;
  rejectedLabel: string;
}

function loadConfig(): DestinationRepoConfig {
  const configPath = path.join(process.cwd(), "config", "destination-repo.json");
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export interface PrCreationResult {
  branchName: string;
  prNumber: number;
  prUrl: string;
  title: string;
  resourceUrl: string;
}

async function ghRequest<T>(
  method: string,
  endpoint: string,
  token: string,
  body?: unknown
): Promise<T> {
  const url = `https://api.github.com${endpoint}`;
  const res: Response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "content-refresh-automation",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${url} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fork-based PR creation flow:
 *   1. Read base branch SHA + templates.json from the ORIGINAL repo (source of truth)
 *   2. Create branch on the FORK (where we have write access)
 *   3. Commit updated templates.json to the FORK branch
 *   4. Open PR from FORK:branch → ORIGINAL:main
 *   5. Try to add label on the original (graceful — may not have permission)
 *
 * When forkOwner is not set in config, falls back to writing directly to owner/repo
 * (original behaviour for when direct write access is available).
 */
export async function createDestinationPr(
  candidate: ClassifiedResource,
  imagePath: string,
  githubToken: string
): Promise<PrCreationResult> {
  const { owner, forkOwner, repo, baseBranch, templatePath } = loadConfig();

  // Write target: fork if configured, otherwise original
  const writeOwner = forkOwner ?? owner;

  const resource: Resource = transformForDestination(candidate, imagePath);
  const branchName = buildBranchName(resource.website);
  const prBody = buildPrBody(resource);

  // Step 1: get base branch SHA from ORIGINAL (ensures branch is based on latest)
  const refData = await ghRequest<{ object: { sha: string } }>(
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
    githubToken
  );
  const baseSha = refData.object.sha;

  // Step 2: fetch templates.json from ORIGINAL (content + blob SHA)
  const fileData = await ghRequest<{ content: string; sha: string; encoding: string }>(
    "GET",
    `/repos/${owner}/${repo}/contents/${templatePath}?ref=${encodeURIComponent(baseBranch)}`,
    githubToken
  );

  if (fileData.encoding !== "base64") {
    throw new Error(`Unexpected encoding for ${templatePath}: ${fileData.encoding}`);
  }

  const existing: Resource[] = JSON.parse(
    Buffer.from(fileData.content, "base64").toString("utf-8")
  );
  existing.push(resource);
  const updatedContent = Buffer.from(
    JSON.stringify(existing, null, 2),
    "utf-8"
  ).toString("base64");

  // Step 3: create branch on FORK from original's latest SHA
  await ghRequest(
    "POST",
    `/repos/${writeOwner}/${repo}/git/refs`,
    githubToken,
    { ref: `refs/heads/${branchName}`, sha: baseSha }
  );

  // Step 4: commit updated templates.json to FORK branch
  // blob SHA is the same as original since branch starts from the same commit
  await ghRequest(
    "PUT",
    `/repos/${writeOwner}/${repo}/contents/${templatePath}`,
    githubToken,
    {
      message: `content-refresh: add "${resource.title}"`,
      content: updatedContent,
      sha: fileData.sha,
      branch: branchName,
    }
  );

  // Step 5: open PR on ORIGINAL repo — head uses fork owner prefix when fork is configured
  const prHead = forkOwner ? `${forkOwner}:${branchName}` : branchName;
  const pr = await ghRequest<{ number: number; html_url: string }>(
    "POST",
    `/repos/${owner}/${repo}/pulls`,
    githubToken,
    {
      title: `[Content Refresh] ${resource.title}`,
      body: prBody,
      head: prHead,
      base: baseBranch,
    }
  );

  // Step 6: add label on original — graceful, not fatal if permission denied
  try {
    await ghRequest(
      "POST",
      `/repos/${owner}/${repo}/issues/${pr.number}/labels`,
      githubToken,
      { labels: ["needs-review"] }
    );
  } catch (err) {
    console.warn(`[createDestinationPr] Could not add label (skipping): ${(err as Error).message}`);
  }

  return {
    branchName,
    prNumber: pr.number,
    prUrl: pr.html_url,
    title: resource.title,
    resourceUrl: resource.website,
  };
}
