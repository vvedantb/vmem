import { parseAsStringLiteral } from "nuqs";

/**
 * Inbox URL state. `tab` chooses which panel renders (proposals or
 * notifications). The events tab moved to `/activity` since it's a
 * passive log, not an attention-grabber.
 */

const inboxTabs = ["proposals", "notifications"] as const;
export type InboxTab = (typeof inboxTabs)[number];

export const inboxSearchParams = {
  tab: parseAsStringLiteral(inboxTabs).withDefault("proposals"),
};
