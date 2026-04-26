import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/ai-logs` route — preserved as a redirect after the merge into
 * `/activity?tab=ai-logs`.
 */
export const Route = createFileRoute("/_main/ai-logs/")({
  beforeLoad: () => {
    throw redirect({ to: "/activity", search: { tab: "ai-logs" } });
  },
  component: () => null,
});
