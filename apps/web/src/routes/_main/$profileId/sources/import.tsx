import { createFileRoute } from "@tanstack/react-router";
import ImportPageClient from "@/components/settings/ImportPageClient";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { SourcesTabs } from "@/components/dashboard/HomeSectionTabs";

export const Route = createFileRoute("/_main/$profileId/sources/import")({
  component: ImportRoute,
});

function ImportRoute() {
  return (
    <SettingsPage title="Sources" stack={false} tabs={<SourcesTabs />}>
      <ImportPageClient />
    </SettingsPage>
  );
}
