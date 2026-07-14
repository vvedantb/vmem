import { createFileRoute, redirect } from "@tanstack/react-router";

// legacy `/openrouter-logs` route
export const Route = createFileRoute("/_main/$profileId/openrouter-logs/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/activity/ai-logs", params });
  },
  component: () => null,
});
