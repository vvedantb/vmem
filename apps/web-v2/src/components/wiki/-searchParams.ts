import { parseAsString } from "nuqs";

/**
 * URL-synced state for /wiki.
 * `doc` holds the currently open document's wikiNodes _id (a Convex Id, string-branded).
 * Empty string = no document selected (show placeholder).
 */
export const wikiSearchParams = {
  doc: parseAsString.withDefault(""),
};
