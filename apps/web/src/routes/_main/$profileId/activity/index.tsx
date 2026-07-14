import { createFileRoute, redirect } from "@tanstack/react-router";

// `/activity` — redirects to the default tab (`/activity/ai-logs`)
export const Route = createFileRoute("/_main/$profileId/activity/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/activity/ai-logs", params });
  },
  component: () => null,
});
