// browseKey v1: stable dedupe key for browsing-history rows. The backend
// recomputes it for the one-off cleanup, so any change here must bump the
// version and ship a migration; never change v1 output in place.

// query params that never change what the page shows (ads, analytics, Google noise)
const TRACKING_PARAMS = new Set([
  "gclid",
  "gclsrc",
  "dclid",
  "fbclid",
  "msclkid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "_hsenc",
  "_hsmi",
  "ref",
  "ref_src",
  "sca_esv",
  "sca_upv",
  "rlz",
  "ei",
  "ved",
  "uact",
  "oq",
  "aqs",
  "gs_lp",
  "gs_lcp",
  "gs_lcrp",
  "gs_ssp",
  "sclient",
  "sxsrf",
  "iflsig",
  "sei",
  "bih",
  "biw",
  "dpr",
  "sourceid",
  "ie",
  "oe",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAMS.has(lower);
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

function canonicalHost(parsed: URL): string {
  return parsed.host.toLowerCase().replace(/^www\./, "");
}

// lowercase host, no www., no fragment, no tracking params, sorted query,
// no trailing slash on non-root paths; invalid input comes back trimmed
export function canonicalUrl(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) return url.trim();

  const params = [...parsed.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([aName, aValue], [bName, bValue]) =>
      aName === bName
        ? aValue.localeCompare(bValue)
        : aName.localeCompare(bName),
    );
  const query = new URLSearchParams(params).toString();
  const path =
    parsed.pathname.length > 1 && parsed.pathname.endsWith("/")
      ? parsed.pathname.replace(/\/+$/, "") || "/"
      : parsed.pathname;

  return `${parsed.protocol}//${canonicalHost(parsed)}${path}${query ? `?${query}` : ""}`;
}

// trim, collapse whitespace, strip a leading unread count like "(3) "
function cleanTitle(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\(\d+\+?\)\s*/, "");
}

// "https://a.b/c" or "a.b/c": what Chrome shows for untitled pages
const BARE_URL_PATTERN =
  /^([a-z][a-z0-9+.-]*:\/\/\S+|[\w-]+(\.[\w-]+)+(:\d+)?\/\S*)$/i;

function isRealTitle(title: string, url: string, host: string): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  if (lower === url.trim().toLowerCase()) return false;
  if (lower === host || lower === `www.${host}`) return false;
  return !BARE_URL_PATTERN.test(title);
}

type BrowseParts =
  | { kind: "title"; key: string; host: string; title: string }
  | { kind: "url"; key: string; host: string; canonicalUrl: string };

// title key collapses SPA routes that share one title; url key is the fallback
export function browseParts(entry: {
  url: string;
  title?: string;
}): BrowseParts {
  const parsed = parseUrl(entry.url);
  const host = parsed ? canonicalHost(parsed) : "";
  const title = cleanTitle(entry.title ?? "");

  if (host && isRealTitle(title, entry.url, host)) {
    return {
      kind: "title",
      key: `${host}|${title.toLowerCase()}`,
      host,
      title,
    };
  }
  const canonical = canonicalUrl(entry.url);
  return {
    kind: "url",
    key: `url|${canonical}`,
    host,
    canonicalUrl: canonical,
  };
}

export function browseKey(entry: { url: string; title?: string }): string {
  return browseParts(entry).key;
}
