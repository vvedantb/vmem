import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";

const blastDirections = ["upstream", "downstream"] as const;

const codeNodeKinds = [
  "code-file",
  "code-function",
  "code-class",
  "code-interface",
  "code-process",
] as const;

/**
 * URL-backed filter state for the codebase graph view.
 *
 * Default `kinds` is the most common-sense triplet (file/function/class) — we
 * leave interfaces and processes off by default because they tend to bloat
 * the canvas before the user has had a chance to orient themselves.
 *
 * `blastRadiusOf` doubles as the "selected symbol" pointer so the side panel
 * and the canvas highlight stay in sync — clicking a node sets it, closing
 * the panel clears it.
 */
export const codebaseSearchParams = {
  kinds: parseAsArrayOf(parseAsStringLiteral(codeNodeKinds), ",").withDefault([
    "code-file",
    "code-function",
    "code-class",
  ]),
  processId: parseAsString,
  blastRadiusOf: parseAsString,
  blastDirection: parseAsStringLiteral(blastDirections).withDefault("upstream"),
  search: parseAsString.withDefault(""),
};
