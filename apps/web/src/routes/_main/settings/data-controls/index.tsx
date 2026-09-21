import { createFileRoute, redirect } from "@tanstack/react-router";

// `/settings/data-controls` lands on export. Import lives under Sources.
export const Route = createFileRoute("/_main/settings/data-controls/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/data-controls/export" });
  },
  component: () => null,
});
