import { parseAsString } from "nuqs";

/** URL-backed search for the codebases sidebar list (separate from graph `search`). */
export const codebasesListSearchParams = {
  q: parseAsString.withDefault(""),
};
