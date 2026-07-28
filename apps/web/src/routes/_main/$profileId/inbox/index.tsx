import { createFileRoute, redirect } from "@tanstack/react-router";

// `/inbox` redirects to the default tab (`/inbox/proposals`)
export const Route = createFileRoute("/_main/$profileId/inbox/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/inbox/proposals", params });
  },
  component: () => null,
});
