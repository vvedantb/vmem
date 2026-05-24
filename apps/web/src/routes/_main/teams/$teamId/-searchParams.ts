import { parseAsArrayOf, parseAsString } from "nuqs";

/** URL-backed filters for `/teams/:id/knowledge` only. */
export const teamKnowledgeSearchParams = {
  q: parseAsString.withDefault(""),
  tags: parseAsArrayOf(parseAsString, ",").withDefault([]),
};
