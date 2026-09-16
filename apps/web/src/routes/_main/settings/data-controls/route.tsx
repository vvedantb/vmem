import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { DataControlsTabs } from "./-components/DataControlsTabs";

export const Route = createFileRoute("/_main/settings/data-controls")({
  component: DataControlsLayout,
});

function DataControlsLayout() {
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
