import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$profileId/sources")({
  component: SourcesLayout,
});

function SourcesLayout() {
  return <Outlet />;
}
