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

/**
 * Write-time normaliser for `memories.tags`: sanitises every tag, then applies
 * the deterministic domain merges inside the list (`wwwyoutubecom` and
 * `youtubecom` + `youtube` become `youtube`), dedupes and caps. `existing` is
 * the tag set already on the memory: it lets a lone weak `brandcom` tag merge
 * into a brand tag that the write itself does not carry.
 */
export function normalizeTags(
  tags: readonly string[],
  max: number = 10,
  existing: readonly string[] = [],
): string[] {
  const sanitized = [...new Set(tags.map(sanitizeTag))].filter(
    (tag) => tag.length > 0,
  );
  const merges = planTagMerges([...sanitized, ...existing]);
  return applyTagMerges(sanitized, merges).slice(0, max);
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

// a plain `brandcom` tag merges into an existing brand tag only at this brand
// length: `telecom` must not merge into `tele`
const MIN_WEAK_BRAND_LENGTH = 5;

export interface TagMerge {
  keeper: string;
  losers: string[];
}

/**
 * Groups tags by brand. The keeper is the brand itself (`youtube`), even if
 * no memory carries it yet. A group merges when it has a www-prefixed tag,
 * or when a plain `brandcom` tag sits next to the brand tag. Running the
 * plan on the merged result returns no groups.
 */
export function planTagMerges(tags: Iterable<string>): TagMerge[] {
  const present = new Set(tags);
  const byBrand = new Map<string, { strong: string[]; weak: string[] }>();
  for (const tag of present) {
    const legacy = legacyDomainTag(tag);
    if (!legacy) continue;
    const entry = byBrand.get(legacy.brand) ?? { strong: [], weak: [] };
    entry[legacy.strong ? "strong" : "weak"].push(tag);
    byBrand.set(legacy.brand, entry);
  }
  const merges: TagMerge[] = [];
  for (const [brand, { strong, weak }] of byBrand) {
    // a keeper that would merge again next run breaks idempotence
    if (legacyDomainTag(brand) !== null) continue;
    const mergeWeak =
      strong.length > 0 ||
      (present.has(brand) && brand.length >= MIN_WEAK_BRAND_LENGTH);
    const losers = [...strong, ...(mergeWeak ? weak : [])]
      .filter((tag) => tag !== brand)
      .sort();
    if (losers.length > 0) merges.push({ keeper: brand, losers });
  }
  return merges.sort((a, b) => a.keeper.localeCompare(b.keeper));
}

/** Replaces losers with keepers, keeps order and drops repeats. */
export function applyTagMerges(
  tags: readonly string[],
  merges: readonly TagMerge[],
): string[] {
  const keeperOf = new Map(
    merges.flatMap((merge) =>
      merge.losers.map((loser): [string, string] => [loser, merge.keeper]),
    ),
  );
  return [...new Set(tags.map((tag) => keeperOf.get(tag) ?? tag))];
}
