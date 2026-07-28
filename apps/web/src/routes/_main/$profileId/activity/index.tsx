import { createFileRoute, redirect } from "@tanstack/react-router";

// `/activity` redirects to the default tab (`/activity/usage`)
export const Route = createFileRoute("/_main/$profileId/activity/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/activity/usage", params });
  },
  component: () => null,
});
