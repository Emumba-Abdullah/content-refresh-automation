import * as fs from "fs";
import * as path from "path";
import fetch, { Response } from "node-fetch";
import { ClassifiedResource, Resource } from "../types/resource";
import { transformForDestination } from "../process/transformForDestination";
import { buildBranchName } from "./buildBranchName";
import { buildPrBody } from "./buildPrBody";

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
 * Full remote PR creation flow for a single resource:
 *   1. Transform candidate → destination-ready Resource
 *   2. Fetch current SHA of base branch tip
 *   3. Fetch current templates.json content + SHA (for update)
 *   4. Append the new resource to the array
 *   5. Create branch from base branch tip
 *   6. Commit updated templates.json to new branch
 *   7. Open PR into base branch
 *   8. Add "needs-review" label to PR
 *
 * Never pushes to main. Never merges. One resource per PR. No local disk writes.
 */
export async function createDestinationPr(
  candidate: ClassifiedResource,
  imagePath: string,
  githubToken: string
): Promise<PrCreationResult> {
  const { owner, repo, baseBranch, templatePath } = loadConfig();

  const resource: Resource = transformForDestination(candidate, imagePath);
  const branchName = buildBranchName(resource.website);
  const prBody = buildPrBody(resource);

  // Step 1: get base branch SHA
  const refData = await ghRequest<{ object: { sha: string } }>(
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
    githubToken
  );
  const baseSha = refData.object.sha;

  // Step 2: fetch current templates.json content + blob SHA (needed for update)
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
  const updatedContent = Buffer.from(JSON.stringify(existing, null, 2), "utf-8").toString("base64");

  // Step 3: create branch
  await ghRequest(
    "POST",
    `/repos/${owner}/${repo}/git/refs`,
    githubToken,
    { ref: `refs/heads/${branchName}`, sha: baseSha }
  );

  // Step 4: commit updated templates.json to new branch
  await ghRequest(
    "PUT",
    `/repos/${owner}/${repo}/contents/${templatePath}`,
    githubToken,
    {
      message: `content-refresh: add "${resource.title}"`,
      content: updatedContent,
      sha: fileData.sha,
      branch: branchName,
    }
  );

  // Step 5: open PR
  const pr = await ghRequest<{ number: number; html_url: string }>(
    "POST",
    `/repos/${owner}/${repo}/pulls`,
    githubToken,
    {
      title: `[Content Refresh] ${resource.title}`,
      body: prBody,
      head: branchName,
      base: baseBranch,
    }
  );

  // Step 6: add label
  await ghRequest(
    "POST",
    `/repos/${owner}/${repo}/issues/${pr.number}/labels`,
    githubToken,
    { labels: ["needs-review"] }
  );

  return {
    branchName,
    prNumber: pr.number,
    prUrl: pr.html_url,
    title: resource.title,
    resourceUrl: resource.website,
  };
}
