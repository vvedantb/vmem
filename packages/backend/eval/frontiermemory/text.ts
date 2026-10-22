import { createHash } from "node:crypto";

const STOPWORDS = new Set(
  (
    "the and for are but not you your with this that from have has was were will " +
    "can all any its into than then them they their there these those what when " +
    "which who why how use using used should would could must also just only each " +
    "some such out our about over under after before more most other very make " +
    "made does did done get got file files run runs please task need needs want"
  ).split(" "),
);

/** Lowercase content words, at least 3 chars, stopwords removed. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

export function jaccard(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Token set with digits masked, so "step 3" and "step 4" compare equal. */
export function lessonKey(text: string): Set<string> {
  return new Set(tokenize(text.replace(/\d+/g, "#")));
}

export function slugify(text: string, maxLength = 48): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");
  return slug.length > 0 ? slug : "untitled";
}

export function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function head(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function tail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `…${text.slice(text.length - Math.max(0, maxChars - 1))}`;
}

/** Keeps both ends: two thirds head, one third tail. */
export function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const keep = Math.max(0, maxChars - 1);
  const headChars = Math.ceil((keep * 2) / 3);
  return `${text.slice(0, headChars)}…${text.slice(text.length - (keep - headChars))}`;
}

export function approxTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

// Key-shaped strings. Order matters: specific prefixes before the generic
// `key = value` form.
const SECRET_PATTERNS: readonly RegExp[] = [
  /\bvmem_sk_[A-Za-z0-9_-]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\b(?:pk|sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const SECRET_ASSIGNMENT =
  /\b([A-Za-z0-9_]*(?:api[_-]?key|secret|token|password|passwd)[A-Za-z0-9_]*)(\s*[:=]\s*)(["']?)[^\s"']{8,}\3/gi;

const REDACTED = "[REDACTED]";

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, REDACTED);
  return out.replace(
    SECRET_ASSIGNMENT,
    (_match, name: string, sep: string) => `${name}${sep}${REDACTED}`,
  );
}
