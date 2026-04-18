import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/preferences" });
  },
  component: () => null,
});
