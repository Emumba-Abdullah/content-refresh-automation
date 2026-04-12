import { Resource } from "../types/resource";
import { normalizeUrl } from "../utils/normalizeUrl";

/**
 * Builds the PR body for a single resource addition.
 *
 * The machine-readable "resource-url:" line is MANDATORY.
 * It is used by filterNewCandidates (Step 13) to detect open and rejected PRs
 * for the same resource on future runs. Do not remove it.
 */
export function buildPrBody(resource: Resource): string {
  const normalized = normalizeUrl(resource.website);

  const tagsLine = resource.tags?.length ? resource.tags.join(", ") : "—";
  const dateLine = resource.date ?? "—";

  return [
    `## New Resource: ${resource.title}`,
    ``,
    `| Field    | Value |`,
    `|----------|-------|`,
    `| Priority | ${resource.priority} |`,
    `| Date     | ${dateLine} |`,
    `| Tags     | ${tagsLine} |`,
    ``,
    `**URL:** ${resource.website}`,
    ``,
    `**Description:**`,
    resource.description,
    ``,
    `---`,
    ``,
    `<!-- machine-readable: do not edit this line -->`,
    `resource-url: ${normalized}`,
  ].join("\n");
}
