import { createFileRoute, redirect } from "@tanstack/react-router";

// legacy `/settings/usage` route — preserved as a redirect after the move into `/settings/api/usage`
export const Route = createFileRoute("/_main/settings/usage")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/api/usage" });
  },
  component: () => null,
});
