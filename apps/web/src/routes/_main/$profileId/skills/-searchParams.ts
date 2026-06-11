import { parseAsString } from "nuqs";

/** URL-backed search for `/skills` routes (sidebar list + redirect logic). */
export const skillsSearchParams = {
  q: parseAsString.withDefault(""),
};
