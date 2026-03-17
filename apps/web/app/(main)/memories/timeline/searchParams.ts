import { parseAsString, parseAsStringLiteral } from "nuqs";

const timelineModes = ["history", "trail"] as const;

const timelineSearchParams = {
  mode: parseAsStringLiteral(timelineModes).withDefault("history"),
  memoryId: parseAsString.withDefault(""),
  tag: parseAsString.withDefault(""),
  query: parseAsString.withDefault(""),
};

export { timelineSearchParams };
