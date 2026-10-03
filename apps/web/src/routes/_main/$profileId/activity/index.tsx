import { createFileRoute, redirect } from "@tanstack/react-router";

// legacy `/activity` route preserved as a redirect after Usage moved to `/usage`
export const Route = createFileRoute("/_main/$profileId/activity/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/usage", params, search: true });
  },
  component: () => null,
});
