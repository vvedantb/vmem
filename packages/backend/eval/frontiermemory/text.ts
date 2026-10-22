import { createHash } from "node:crypto";

export {
  jaccard,
  lessonKey,
  slugify,
  tokenize,
} from "../../engine/memory/skills/words.ts";

export function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function head(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

const TITLE_MAX_CHARS = 60;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const POLITE_OPENER =
  /^(?:please|kindly|(?:can|could|would) you(?: please)?|i (?:want|need) you to)\s+/i;

/** A real sentence: two or more words, mostly letters (not a number grid). */
function isReadable(sentence: string): boolean {
  const words = sentence.match(/\p{L}{3,}/gu) ?? [];
  const letters = sentence.match(/\p{L}/gu)?.length ?? 0;
  const chars = sentence.replace(/\s/g, "").length;
  return words.length >= 2 && letters >= chars * 0.6;
}

/** Cuts at a word boundary and marks the cut. */
function cutTitle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const space = cut.lastIndexOf(" ");
  const kept = space > maxChars / 2 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * Short readable title from a task prompt: the first real sentence, with
 * code, maths, JSON, arrays, bracketed asides, links and markdown removed,
 * cut at a word boundary. "" when the text has no readable sentence.
 */
export function topicTitle(text: string, maxChars = TITLE_MAX_CHARS): string {
  let out = text
    .replace(/```[\s\S]*?(?:```|$)/g, "\n")
    .replace(/`([^`\s]{1,40})`/g, "$1")
    .replace(/`[^`\n]*`?/g, " ")
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, " ")
    .replace(/<[^>\n]*>/g, " ")
    .replace(/\bhttps?:\/\/\S+/g, " ");
  // JSON, arrays and asides, innermost first; then any unmatched bracket.
  for (let previous = ""; previous !== out; ) {
    previous = out;
    out = out.replace(/\[[^[\]]*\]|\{[^{}]*\}|\([^()]*\)/g, " ");
  }
  out = out.replace(/[[\]{}()<>"|*~]/g, " ");
  // Paragraphs; a markdown heading or list item stands alone.
  const units: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) units.push(current.join(" "));
    current = [];
  };
  for (const raw of out.split("\n")) {
    const marker = /^\s*(?:#{1,6}|[-+>]|\d+[.)])\s+/;
    const line = raw.replace(marker, "").trim();
    const standalone = marker.test(raw);
    if (line === "" || standalone) flush();
    if (line !== "") current.push(line);
    if (standalone) flush();
  }
  flush();
  const sentence = units
    .flatMap((unit) => unit.split(/(?<=[.!?])\s+/))
    .map((item) =>
      collapse(item)
        .replace(/\s+([,;:!?])/g, "$1")
        .replace(/^[^\p{L}\p{N}]+/u, "")
        .replace(POLITE_OPENER, "")
        .replace(/[\s.,;:!?-]+$/, ""),
    )
    .find(isReadable);
  if (!sentence) return "";
  const title = cutTitle(sentence, maxChars);
  return `${title.charAt(0).toUpperCase()}${title.slice(1)}`;
}

/** A model-written title if it is plain words within the cap, else null. */
export function plainTitle(text: string): string | null {
  const title = collapse(text).replace(/[\s.]+$/, "");
  if (title.length < 3 || title.length > TITLE_MAX_CHARS) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s'’&,.:/+-]*$/u.test(title)) return null;
  return /\p{L}{3,}/u.test(title) ? title : null;
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
