import { parseAsStringLiteral } from "nuqs";

const memoryViews = ["graph", "list"] as const;

const memoriesSearchParams = {
  view: parseAsStringLiteral(memoryViews).withDefault("graph"),
};

export { memoriesSearchParams };
