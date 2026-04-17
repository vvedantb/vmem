import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";
import { MEMORY_TYPES } from "@/lib/memories";

const memoryViews = ["graph", "list"] as const;

const memoriesSearchParams = {
  view: parseAsStringLiteral(memoryViews).withDefault("graph"),
  /** When set, graph shows 2-hop local subgraph around this memory ID */
  focus: parseAsString,
  tags: parseAsArrayOf(parseAsString, ",").withDefault([]),
  sources: parseAsArrayOf(parseAsString, ",").withDefault([]),
  types: parseAsArrayOf(parseAsStringLiteral(MEMORY_TYPES), ",").withDefault(
    [],
  ),
};

export { memoriesSearchParams };
