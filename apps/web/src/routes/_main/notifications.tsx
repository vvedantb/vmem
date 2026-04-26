import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/notifications` route — preserved as a redirect after the
 * merge into `/inbox?tab=notifications`.
 */
export const Route = createFileRoute("/_main/notifications")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox", search: { tab: "notifications" } });
  },
  component: () => null,
});
