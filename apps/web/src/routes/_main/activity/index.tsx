import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/activity` route — preserved as a redirect after the merge
 * into `/inbox?tab=activity`.
 */
export const Route = createFileRoute("/_main/activity/")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox", search: { tab: "activity" } });
  },
  component: () => null,
});
