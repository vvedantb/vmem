import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/ai-logs` route — preserved as a redirect after the move into
 * `/activity/ai-logs`.
 */
export const Route = createFileRoute("/_main/ai-logs/")({
  beforeLoad: () => {
    throw redirect({ to: "/activity/ai-logs" });
  },
  component: () => null,
});
