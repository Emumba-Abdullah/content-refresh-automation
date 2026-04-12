import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";
import { normalizeUrl } from "../utils/normalizeUrl";
import { canonicalKey } from "../utils/canonicalKey";

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

export interface DestinationTemplates {
  /** Exact normalized URLs already in templates.json */
  normalizedUrls: Set<string>;
  /** Canonical identity keys for fuzzy cross-path matching */
  canonicalKeys: Set<string>;
}

/**
 * Fetches static/templates.json from the destination repo via GitHub API
 * and returns both exact normalized URLs and canonical identity keys.
 */
export async function loadDestinationTemplates(
  githubToken: string
): Promise<DestinationTemplates> {
  const { owner, repo, baseBranch, templatePath } = loadConfig();

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${templatePath}?ref=${encodeURIComponent(baseBranch)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "content-refresh-automation",
    },
  });

  if (res.status === 404) {
    return { normalizedUrls: new Set(), canonicalKeys: new Set() };
  }

  if (!res.ok) {
    throw new Error(
      `GitHub API error fetching ${templatePath}: ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as { content?: string; encoding?: string };

  if (!data.content || data.encoding !== "base64") {
    throw new Error(`Unexpected response format for ${templatePath}`);
  }

  const decoded = Buffer.from(data.content, "base64").toString("utf-8");
  const templates: Array<{ website?: string }> = JSON.parse(decoded);

  const normalizedUrls = new Set<string>();
  const canonicalKeys = new Set<string>();

  for (const t of templates) {
    if (t.website) {
      normalizedUrls.add(normalizeUrl(t.website));
      const key = canonicalKey(t.website);
      if (key) canonicalKeys.add(key);
    }
  }

  return { normalizedUrls, canonicalKeys };
}

