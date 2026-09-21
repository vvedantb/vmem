import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { DataControlsTabs } from "./-components/DataControlsTabs";

export const Route = createFileRoute("/_main/settings/data-controls")({
  component: DataControlsLayout,
});

function DataControlsLayout() {
  const matchRoute = useMatchRoute();
  // Old import URL redirects to Sources; skip settings chrome during that hop.
  if (matchRoute({ to: "/settings/data-controls/import" })) {
    return <Outlet />;
  }

  return (
    <SettingsPage
      title="Data Controls"
      tabs={<DataControlsTabs />}
      stack={false}
    >
      <Outlet />
    </SettingsPage>
  );
}
