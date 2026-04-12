/**
 * Derives a branch name from a resource URL with a timestamp suffix so that
 * every automation run produces a unique branch even if a previous branch for
 * the same resource was already created and closed.
 *
 * Format: content-refresh/<slug>-<YYYYMMDDHHmm>
 *
 * Rules:
 *   - prefix: "content-refresh/"
 *   - take the last meaningful path segment of the URL as the slug
 *   - lowercase, replace non-alphanumeric chars with hyphens
 *   - collapse consecutive hyphens
 *   - trim leading/trailing hyphens
 *   - append UTC timestamp "-YYYYMMDDHHmm" (13 chars incl. dash)
 *   - total hard cap at 80 chars
 *
 * Example (run at 2026-04-13 14:30 UTC):
 *   https://learn.microsoft.com/en-us/azure/postgresql/azure-ai/generative-ai-overview
 *   → "content-refresh/generative-ai-overview-202604131430"
 */
export function buildBranchName(resourceUrl: string, now: Date = new Date()): string {
  let slug = "resource";

  try {
    const url = new URL(resourceUrl.trim());
    const segments = url.pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);

    if (segments.length > 0) {
      slug = segments[segments.length - 1];
    }
  } catch {
    slug = resourceUrl.trim();
  }

  const sanitized = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // UTC timestamp suffix: YYYYMMDDHHmm (12 digits + 1 dash = 13 chars)
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const ts =
    pad(now.getUTCFullYear(), 4) +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes());
  const suffix = `-${ts}`; // e.g. "-202604131430"

  const prefix = "content-refresh/";
  const maxSlugLength = 80 - prefix.length - suffix.length;
  return `${prefix}${sanitized.slice(0, maxSlugLength)}${suffix}`;
}
