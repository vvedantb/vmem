import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Label, Switch, Skeleton, Card, CardContent } from "@vmem/ui";
import { api } from "@vmem/backend";
import PageContainer from "@/components/shell/PageContainer";
import { useUserSettingsSave } from "@/hooks/useUserSettingsSave";

export const Route = createFileRoute("/_main/settings/extension")({
  component: ExtensionSettingsPage,
});

function ExtensionSettingsPage() {
  const settings = useQuery(api.userSettings.get);
  const { saveSettings } = useUserSettingsSave();

  // AI-generated (Claude), prompt: "extension settings toggle row loading skeletons"
  // Modified by me: two row layout matching real switches
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="ext-auto-sync" className="text-sm font-medium">
                Auto-sync
              </Label>
              <p className="mt-1 text-xs text-muted">
                Sync bookmarks and browsing history on a schedule.
              </p>
            </div>
            <Switch
              id="ext-auto-sync"
              checked={settings.extensionAutoSyncEnabled}
              onCheckedChange={(checked) => {
                void saveSettings({ extensionAutoSyncEnabled: checked });
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label
                htmlFor="ext-selection-popup"
                className="text-sm font-medium"
              >
                Save popup on text selection
              </Label>
              <p className="mt-1 text-xs text-muted">
                Show a quick-save control when you select text on a page.
              </p>
            </div>
            <Switch
              id="ext-selection-popup"
              checked={settings.extensionSelectionPopupEnabled}
              onCheckedChange={(checked) => {
                void saveSettings({ extensionSelectionPopupEnabled: checked });
              }}
            />
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
