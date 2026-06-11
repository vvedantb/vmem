import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/ai-logs` route — preserved as a redirect after the move into
 * `/activity/ai-logs`.
 */
export const Route = createFileRoute("/_main/$profileId/ai-logs/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/activity/ai-logs", params });
  },
  component: () => null,
});
