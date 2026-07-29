import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Skeleton, Card, CardContent, LabeledSwitchRow } from "@vmem/ui";
import { api } from "@vmem/backend";
import PageContainer from "@/components/shell/PageContainer";
import { useUserSettingsSave } from "@/hooks/useUserSettingsSave";

export const Route = createFileRoute("/_main/settings/extension")({
  component: ExtensionSettingsPage,
});

function ExtensionSettingsPage() {
  const settings = useQuery(api.userSettings.get);
  const { saveSettings } = useUserSettingsSave();

  if (settings === undefined) {
    return (
      <PageContainer title="Extension" centeredMaxWidth showTitle>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Extension" centeredMaxWidth showTitle>
      <Card className="shadow-none">
        <CardContent className="space-y-6 p-6">
          <LabeledSwitchRow
            id="ext-auto-sync"
            label="Auto-sync"
            description="Sync bookmarks and browsing history on a schedule."
            checked={settings.extensionAutoSyncEnabled}
            onCheckedChange={(checked) => {
              void saveSettings({ extensionAutoSyncEnabled: checked });
            }}
          />
          <LabeledSwitchRow
            id="ext-selection-popup"
            label="Save popup on text selection"
            description="Show a quick-save control when you select text on a page."
            checked={settings.extensionSelectionPopupEnabled}
            onCheckedChange={(checked) => {
              void saveSettings({ extensionSelectionPopupEnabled: checked });
            }}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
