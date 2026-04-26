import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/settings/api-keys` route — preserved as a redirect after the
 * move into `/settings/api/keys`.
 */
export const Route = createFileRoute("/_main/settings/api-keys")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/api/keys" });
  },
  component: () => null,
});
