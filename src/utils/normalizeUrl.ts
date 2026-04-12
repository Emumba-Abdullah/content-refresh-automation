export function normalizeUrl(input: string): string {
  try {
    const url = new URL(input.trim());

    // Lowercase protocol + hostname
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();

    // Remove common tracking params
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "msclkid",
      "si",
    ];

    trackingParams.forEach((param) => url.searchParams.delete(param));

    // Sort remaining params for stable output
    const sortedParams = new URLSearchParams(
      [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
    );
    url.search = sortedParams.toString();

    // Remove trailing slash from pathname unless root
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return input.trim();
  }
}