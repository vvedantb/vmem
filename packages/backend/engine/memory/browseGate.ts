import { browseParts, canonicalUrl } from "@vmem/shared";

// Server-side pre-write gate for browsing-history rows. No AI calls. It runs
// before browseKey v1 and never changes v1 output: real-title keys stay equal
// to what the current extension sends as externalId.

export const BROWSE_SOURCE = "browsing-history";

export function isBrowseSource(row: {
  source: string;
  sourceType?: string;
}): boolean {
  return row.source === BROWSE_SOURCE || row.sourceType === BROWSE_SOURCE;
}

// noise params that v1 keeps; stripped before keying
const EXTRA_NOISE_PARAMS = ["img_index", "igsh", "si"];

// site-name titles shared by every page of a site; these key by canonical url
export const GENERIC_SITE_TITLES: ReadonlySet<string> = new Set([
  "instagram",
  "youtube",
  "home / x",
  "x",
  "twitter",
  "facebook",
  "linkedin",
  "reddit",
  "tiktok",
  "google",
  "new tab",
]);

/**
 * Bare feed, home, login and new-tab pages that are never worth a memory.
 * `host/path` matches that exact path, `host/prefix*` a path prefix, and
 * `host/*` any path on the host. Hosts are compared without `www.`.
 */
export const LOW_VALUE_BROWSE_PAGES: readonly string[] = [
  "instagram.com/",
  "x.com/",
  "x.com/home",
  "twitter.com/",
  "twitter.com/home",
  "reddit.com/",
  "youtube.com/",
  "youtube.com/feed/*",
  "facebook.com/",
  "linkedin.com/feed",
  "linkedin.com/feed/*",
  "accounts.google.com/*",
  "login.microsoftonline.com/*",
];

const LOW_VALUE_URL_PREFIXES = [
  "about:",
  "chrome://newtab",
  "chrome-search://",
  "edge://newtab",
];

// first path segment of a login page, plus /accounts/login (Instagram); a
// bare /auth is left out because docs sites use it for auth guides
const LOGIN_PATH =
  /^\/(login|log-in|signin|sign-in|signup|sign-up|oauth|oauth2|sso|accounts\/login)(\/|$)/i;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

function hostOf(parsed: URL): string {
  return parsed.host.toLowerCase().replace(/^www\./, "");
}

function matchesPage(host: string, path: string, page: string): boolean {
  const slash = page.indexOf("/");
  if (slash < 0 || page.slice(0, slash) !== host) return false;
  const pattern = page.slice(slash);
  if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

export function isLowValueBrowseUrl(
  url: string,
  pages: readonly string[] = LOW_VALUE_BROWSE_PAGES,
): boolean {
  const trimmed = url.trim().toLowerCase();
  if (LOW_VALUE_URL_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return true;
  }
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = hostOf(parsed);
  const path =
    parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : "/";
  if (LOGIN_PATH.test(path)) return true;
  return pages.some((page) => matchesPage(host, path, page));
}

function stripNoiseParams(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) return url.trim();
  for (const name of EXTRA_NOISE_PARAMS) parsed.searchParams.delete(name);
  return parsed.toString();
}

// same cleanup as browseKey v1: whitespace and a leading unread count
function cleanTitle(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\(\d+\+?\)\s*/, "");
}

export function isGenericSiteTitle(title: string): boolean {
  return GENERIC_SITE_TITLES.has(cleanTitle(title).toLowerCase());
}

export interface BrowseGateParts {
  key: string;
  canonicalUrl: string;
  // stable title/content: a repeat visit writes identical text
  title: string;
  content: string;
}

/**
 * Server key for a browse write: noise params stripped, generic site titles
 * dropped, then browseKey v1. Content is "title\nhost" for a title key; a url
 * key keeps a generic title as "title\ncanonical url", else just the url.
 */
export function browseGateParts(entry: {
  url: string;
  title?: string;
}): BrowseGateParts {
  const url = stripNoiseParams(entry.url);
  const title = cleanTitle(entry.title ?? "");
  const generic = isGenericSiteTitle(title);
  const parts = browseParts({ url, title: generic ? undefined : title });
  const canonical = canonicalUrl(url);
  if (parts.kind === "title") {
    return {
      key: parts.key,
      canonicalUrl: canonical,
      title: parts.title,
      content: `${parts.title}\n${parts.host}`,
    };
  }
  return {
    key: parts.key,
    canonicalUrl: canonical,
    title: generic ? title : canonical,
    content: generic ? `${title}\n${canonical}` : canonical,
  };
}

// the write's url, else the first http(s) line of old extension content
export function browseUrlOf(row: {
  url?: string;
  content: string;
}): string | undefined {
  const url = row.url?.trim();
  if (url) return url;
  return row.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^https?:\/\//i.test(line));
}

export interface SearchPage {
  engine: string;
  // lowercased, whitespace collapsed
  query: string;
}

function isSearchPath(host: string, path: string): boolean {
  if (/^google\.[a-z.]+$/.test(host)) return path === "/search";
  if (host === "bing.com") return path === "/search";
  if (host === "duckduckgo.com") return path === "/" || path === "/html";
  return false;
}

export function searchPageOf(url: string): SearchPage | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const host = hostOf(parsed);
  if (!isSearchPath(host, parsed.pathname.replace(/(.)\/+$/, "$1"))) {
    return null;
  }
  const query = (parsed.searchParams.get("q") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return query ? { engine: host, query } : null;
}

/**
 * True when `next` repeats or refines `prev` on the same engine: identical,
 * a prefix ("red fi" -> "red fish"), or a word superset ("red fish" ->
 * "red fish dish").
 */
export function isSearchRefinement(
  prev: SearchPage,
  next: SearchPage,
): boolean {
  if (prev.engine !== next.engine) return false;
  if (next.query.startsWith(prev.query)) return true;
  const words = new Set(next.query.split(" "));
  return prev.query.split(" ").every((word) => words.has(word));
}
