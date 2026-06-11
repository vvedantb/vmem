import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/notifications` route — preserved as a redirect after the
 * merge into `/inbox/notifications`.
 */
export const Route = createFileRoute("/_main/$profileId/notifications")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/inbox/notifications", params });
  },
  component: () => null,
});
