import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";

const blastDirections = ["upstream", "downstream"] as const;

const codeNodeKinds = [
  "code-file",
  "code-function",
  "code-class",
  "code-interface",
  "code-process",
] as const;

// URL-backed filter state for the codebase graph view
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
