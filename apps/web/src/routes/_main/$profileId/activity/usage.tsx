import { createFileRoute, redirect } from "@tanstack/react-router";

// legacy `/activity/usage` route preserved as a redirect after the move to `/usage`
export const Route = createFileRoute("/_main/$profileId/activity/usage")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/usage", params, search: true });
  },
  component: () => null,
});
