// Byte cap for a transcript upload. Pure. The server rejects a transcript over
// 1.5 MiB of UTF-8 (HTTP 413), so the hook cuts it first. It keeps the start
// of the session and cuts at a line boundary.

/** Server cap on POST /api/v1/transcripts, in UTF-8 bytes (1.5 MiB). */
export const MAX_TRANSCRIPT_BYTES = 1_572_864;

const MARKER = "\n\n[transcript truncated]\n";

/**
 * `text` cut to at most `maxBytes` UTF-8 bytes, marker included.
 * @param {string} text
 * @param {number} [maxBytes]
 * @returns {string}
 */
export function truncateToBytes(text, maxBytes = MAX_TRANSCRIPT_BYTES) {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxBytes) return text;
  const budget = maxBytes - Buffer.byteLength(MARKER, "utf8");
  if (budget <= 0) return "";
  // A cut inside a multi-byte character decodes to U+FFFD; drop it.
  const head = bytes
    .subarray(0, budget)
    .toString("utf8")
    .replace(/\uFFFD+$/u, "");
  const lineEnd = head.lastIndexOf("\n");
  const kept = lineEnd > 0 ? head.slice(0, lineEnd) : head;
  return `${kept}${MARKER}`;
}
