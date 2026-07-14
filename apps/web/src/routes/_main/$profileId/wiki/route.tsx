import { createFileRoute, Outlet } from "@tanstack/react-router";
import { WikiDocRouteRedirect } from "./-components/WikiDocRouteRedirect";

export const Route = createFileRoute("/_main/$profileId/wiki")({
  component: WikiLayout,
});

function WikiLayout() {
  return (
    <>
      <WikiDocRouteRedirect />
      <Outlet />
    </>
  );
}
