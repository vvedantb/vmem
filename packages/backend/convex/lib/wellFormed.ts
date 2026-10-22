// Convex cannot serialise a lone UTF-16 surrogate, so one bad string fails the
// whole function return. TS lib is ES2022, so no String.prototype.toWellFormed.
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Replaces each lone surrogate with U+FFFD. Length stays the same. */
export function toWellFormed(text: string): string {
  return text.replace(LONE_SURROGATE, "�");
}

/**
 * First `max` UTF-16 code units, well-formed. A surrogate pair that straddles
 * the cut is dropped whole, so the result can be one unit shorter.
 */
export function truncateWellFormed(text: string, max: number): string {
  const cut = text.slice(0, Math.max(0, max));
  const splitsPair =
    cut.length > 0 &&
    cut.length < text.length &&
    isHighSurrogate(cut.charCodeAt(cut.length - 1)) &&
    isLowSurrogate(text.charCodeAt(cut.length));
  return toWellFormed(splitsPair ? cut.slice(0, -1) : cut);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
