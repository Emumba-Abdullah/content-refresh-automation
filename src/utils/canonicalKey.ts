/**
 * Derives a canonical identity key for a URL to enable fuzzy matching across
 * Microsoft Learn URL restructurings.
 *
 * Problem: The same article can appear under different URL shapes over time:
 *   Destination: learn.microsoft.com/azure/postgresql/flexible-server/<slug>
 *   Candidate:   learn.microsoft.com/en-us/azure/postgresql/azure-ai/<slug>
 *
 * Strategy by domain:
 *   learn.microsoft.com — strip locale, normalize intermediate subdirectory
 *     /azure/postgresql/<any-subdir>/<slug>  →  "azure/postgresql/<slug>"
 *     /training/(modules|paths)/<slug>/...   →  "training/<slug>"
 *     Everything else                        →  stripped locale path
 *   Other domains — return null (no canonical key, use normalized URL only)
 */
export function canonicalKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (!url.hostname.endsWith("learn.microsoft.com")) {
    return null;
  }

  // Strip optional locale prefix: /en-us/, /de-de/, /zh-cn/, etc.
  const localeStripped = url.pathname.replace(
    /^\/[a-z]{2}(?:-[a-zA-Z0-9]+)*\//,
    "/"
  );

  // MS Learn PostgreSQL article paths:
  //   /azure/postgresql/<flexible-server|azure-ai|…>/<slug>
  // → canonical: "azure/postgresql/<slug>"
  const pgMatch = localeStripped.match(
    /^\/azure\/postgresql\/[^/]+\/([^/]+)\/?$/
  );
  if (pgMatch) {
    return `azure/postgresql/${pgMatch[1]}`;
  }

  // MS Learn training paths:
  //   /training/paths/<slug>/  or  /training/modules/<slug>/
  // → canonical: "training/<slug>"
  const trainingMatch = localeStripped.match(
    /^\/training\/(?:paths|modules)\/([^/]+)\/?/
  );
  if (trainingMatch) {
    return `training/${trainingMatch[1]}`;
  }

  // Fallback for other learn.microsoft.com paths: use locale-stripped path
  return localeStripped.replace(/\/+$/, "");
}
