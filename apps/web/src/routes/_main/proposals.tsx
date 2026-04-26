import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/proposals` route — preserved as a redirect after the merge
 * into `/inbox/proposals`. Existing bookmarks and external links continue
 * to land on the right tab.
 */
export const Route = createFileRoute("/_main/proposals")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox/proposals" });
  },
  component: () => null,
});
