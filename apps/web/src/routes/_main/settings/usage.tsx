import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/settings/usage` route — preserved as a redirect after the
 * merge into `/settings/api?tab=usage`.
 */
export const Route = createFileRoute("/_main/settings/usage")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/api", search: { tab: "usage" } });
  },
  component: () => null,
});
