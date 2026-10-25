const TAG_MAX_LENGTH = 50;

// public suffixes dropped from host-like tags so `youtube.com` and
// `www.youtube.com` both become `youtube`
const COMPOUND_SUFFIXES = [
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "co.nz",
  "co.jp",
  "co.in",
  "com.br",
];
const SUFFIXES = [
  "com",
  "org",
  "net",
  "io",
  "co",
  "ai",
  "app",
  "dev",
  "edu",
  "gov",
  "uk",
  "us",
  "de",
  "fr",
  "eu",
  "tv",
  "me",
  "info",
  "so",
  "xyz",
];
const HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MIN_BRAND_LENGTH = 3;

function basicSanitize(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, TAG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
}

// `https://www.youtube.com/watch?v=1` -> `youtube`; null when the input is
// not a host name with a known public suffix (`node.js`, `v1.2`, plain words)
function brandOfHost(raw: string): string | null {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "");
  if (!HOST_PATTERN.test(host)) return null;
  const labels = host.split(".");
  if (labels[0] === "www" && labels.length > 1) labels.shift();
  const tail2 = labels.slice(-2).join(".");
  const dropped = COMPOUND_SUFFIXES.includes(tail2)
    ? 2
    : SUFFIXES.includes(labels[labels.length - 1] ?? "")
      ? 1
      : 0;
  if (dropped === 0 || labels.length <= dropped) return null;
  // the registrable label: `docs.google.com` -> `google`
  const brand = basicSanitize(labels[labels.length - dropped - 1] ?? "");
  return brand.length > 0 ? brand : null;
}

/** Lowercase, dash-separated `[a-z0-9-]` tag; host names collapse to the brand. */
export function sanitizeTag(tag: string): string {
  return brandOfHost(tag) ?? basicSanitize(tag);
}

export function normalizeTags(tags: string[], max: number = 10): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = sanitizeTag(raw);
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= max) break;
  }
  return result;
}

// Tags written before host names were collapsed lost their dots:
// `www.youtube.com` -> `wwwyoutubecom`, `youtube.com` -> `youtubecom`.
const DOTLESS_SUFFIXES = [
  ...COMPOUND_SUFFIXES.map((suffix) => suffix.replace(".", "")),
  ...SUFFIXES,
].sort((a, b) => b.length - a.length);

export interface LegacyDomainTag {
  brand: string;
  // true: starts with `www` and ends with a suffix, so it is surely a host
  // name. false: only ends with a suffix (`telecom`), so it needs a tag
  // that already is the brand before it may merge.
  strong: boolean;
}

export function legacyDomainTag(tag: string): LegacyDomainTag | null {
  const strong = /^www[a-z0-9]/.test(tag);
  const body = strong ? tag.slice(3) : tag;
  const suffix = DOTLESS_SUFFIXES.find((s) => body.endsWith(s));
  if (suffix === undefined) return null;
  const brand = body.slice(0, body.length - suffix.length);
  if (brand.length < MIN_BRAND_LENGTH || brand.includes("-")) return null;
  return { brand, strong };
}
