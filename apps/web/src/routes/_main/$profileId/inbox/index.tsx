import { createFileRoute, redirect } from "@tanstack/react-router";

// `/inbox` redirects to `/inbox/notifications`
export const Route = createFileRoute("/_main/$profileId/inbox/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/inbox/notifications", params });
  },
  component: () => null,
});
