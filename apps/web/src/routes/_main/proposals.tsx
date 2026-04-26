import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/proposals` route — preserved as a redirect after the merge
 * into `/inbox?tab=proposals`. Existing bookmarks and external links
 * continue to land on the right tab.
 */
export const Route = createFileRoute("/_main/proposals")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox", search: { tab: "proposals" } });
  },
  component: () => null,
});
