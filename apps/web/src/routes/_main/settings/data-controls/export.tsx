import { createFileRoute } from "@tanstack/react-router";
import { IconFileExport } from "@tabler/icons-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/components/settings/SettingsEmptyState";

export const Route = createFileRoute("/_main/settings/data-controls/export")({
  component: ExportRoute,
});

function ExportRoute() {
  return (
    <SettingsSection title="Export">
      <SettingsEmptyState
        icon={IconFileExport}
        title="Export coming soon"
        description="You'll be able to download your memories, tags, and relationships as a single archive from here."
      />
    </SettingsSection>
  );
}
