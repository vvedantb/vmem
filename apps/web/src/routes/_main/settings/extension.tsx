import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { Label, Switch, Skeleton } from "@vmem/ui";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";

export const Route = createFileRoute("/_main/settings/extension")({
  component: ExtensionSettingsPage,
});

function ExtensionSettingsPage() {
  const settings = useQuery(api.userSettings.get);
  const updateSettings = useMutation(api.userSettings.update);

  if (settings === undefined) {
    return (
      <PageContainer title="Extension" centeredMaxWidth showTitle>
        <div className="space-y-6">
          <Skeleton className="h-4 w-64" />
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
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Browser extension settings. The same preferences apply when you change
          them in the extension popup.
        </p>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="ext-auto-sync" className="text-sm font-medium">
              Auto-sync
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Sync bookmarks and browsing history on a schedule.
            </p>
          </div>
          <Switch
            id="ext-auto-sync"
            checked={settings.extensionAutoSyncEnabled}
            onCheckedChange={(checked) => {
              void updateSettings({ extensionAutoSyncEnabled: checked });
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
            <p className="mt-1 text-xs text-muted-foreground">
              Show a quick-save control when you select text on a page.
            </p>
          </div>
          <Switch
            id="ext-selection-popup"
            checked={settings.extensionSelectionPopupEnabled}
            onCheckedChange={(checked) => {
              void updateSettings({ extensionSelectionPopupEnabled: checked });
            }}
          />
        </div>
      </div>
    </PageContainer>
  );
}
