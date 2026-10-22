import { createFileRoute, redirect } from "@tanstack/react-router";

// legacy `/inbox/proposals` route preserved as a redirect after the move to
// the Dreaming page (its default tab is Proposals)
export const Route = createFileRoute("/_main/$profileId/inbox/proposals")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/dreaming", params });
  },
  component: () => null,
});
