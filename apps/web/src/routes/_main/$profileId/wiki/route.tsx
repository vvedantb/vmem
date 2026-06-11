import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$profileId/wiki")({
  component: WikiLayout,
});

function WikiLayout() {
  return <Outlet />;
}
