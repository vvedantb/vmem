import { createFileRoute, redirect } from "@tanstack/react-router";

// `/settings/data-controls` redirects to the default tab (`/settings/data-controls/import`)
export const Route = createFileRoute("/_main/settings/data-controls/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/data-controls/import" });
  },
  component: () => null,
});
