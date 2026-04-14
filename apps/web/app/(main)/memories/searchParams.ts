import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";

const memoryViews = ["graph", "list"] as const;

const memoriesSearchParams = {
  view: parseAsStringLiteral(memoryViews).withDefault("graph"),
  /** When set, graph shows 2-hop local subgraph around this memory ID */
  focus: parseAsString,
  tags: parseAsArrayOf(parseAsString, ",").withDefault([]),
  source: parseAsString,
};

export { memoriesSearchParams };
