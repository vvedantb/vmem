import { createFileRoute, redirect } from "@tanstack/react-router";

// legacy `/proposals` route preserved as a redirect after the merge into `/inbox/proposals`
export const Route = createFileRoute("/_main/$profileId/proposals")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/inbox/proposals", params });
  },
  component: () => null,
});
