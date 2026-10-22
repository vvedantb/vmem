import { parseAsStringLiteral } from "nuqs";

// URL tab state for the `/dreaming` route. Proposals is the default, so
// links and redirects to `/dreaming` land on the review queue.
const DREAMING_TABS = ["proposals", "history"] as const;

export const dreamingSearchParams = {
  tab: parseAsStringLiteral(DREAMING_TABS).withDefault("proposals"),
};
