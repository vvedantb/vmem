import { parseAsString } from "nuqs";

/** URL-backed search for `/teams` routes (sidebar list + redirect logic). */
export const teamsSearchParams = {
  q: parseAsString.withDefault(""),
};
