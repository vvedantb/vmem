import { createFileRoute, redirect } from "@tanstack/react-router";

// `/settings/api` — redirects to the default tab (`/settings/api/usage`)
export const Route = createFileRoute("/_main/settings/api/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/api/usage" });
  },
  component: () => null,
});
