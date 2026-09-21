import { createFileRoute } from "@tanstack/react-router";
import ImportPageClient from "@/components/settings/ImportPageClient";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const Route = createFileRoute("/_main/$profileId/sources/import")({
  component: ImportRoute,
});

function ImportRoute() {
  return (
    <SettingsPage title="Import" stack={false}>
      <ImportPageClient />
    </SettingsPage>
  );
}
