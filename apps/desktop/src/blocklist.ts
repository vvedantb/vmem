export interface ActiveWindow {
  app: string;
  title: string;
}

const DEFAULT_BLOCKED_APPS: readonly string[] = [
  "1Password",
  "Bitwarden",
  "LastPass",
  "KeePass",
  "Dashlane",
  "NordPass",
  "Proton Pass",
  "RoboForm",
];

const DEFAULT_BLOCKED_TITLE_FRAGMENTS: readonly string[] = [
  "Incognito",
  "InPrivate",
  "Private Browsing",
  "Private Window",
];

function includesFold(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * True when the window must not be recorded. Matches case-insensitively on
 * substrings of the app name and the title. Password manager names also match
 * in titles, so a browser tab showing a vault is blocked.
 */
export function isBlocked(
  window: ActiveWindow,
  userPatterns: readonly string[] = [],
): boolean {
  const patterns = [
    ...DEFAULT_BLOCKED_APPS,
    ...DEFAULT_BLOCKED_TITLE_FRAGMENTS,
    ...userPatterns.map((pattern) => pattern.trim()),
  ].filter((pattern) => pattern.length > 0);
  return patterns.some(
    (pattern) =>
      includesFold(window.app, pattern) || includesFold(window.title, pattern),
  );
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9+/_-]{40,}={0,2}/g,
  /\bvmem_sk_\S+/g,
];

/** Replaces secret-looking fragments with `[redacted]`. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS)
    out = out.replace(pattern, "[redacted]");
  return out.replace(/\s+/g, " ").trim();
}

/** Redacts secret-looking fragments and trims the title to a safe length. */
export function sanitiseTitle(title: string): string {
  const out = redactSecrets(title);
  return out.length > 120 ? `${out.slice(0, 117)}...` : out;
}
