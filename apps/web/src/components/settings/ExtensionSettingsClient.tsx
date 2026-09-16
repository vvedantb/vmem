import { useQuery } from "convex/react";
import { Skeleton, Switch } from "@vmem/ui";
import { api } from "@vmem/backend";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/settings/SettingsToggleRow";
import { useUserSettingsSave } from "@/hooks/useUserSettingsSave";

export function ExtensionSettingsClient() {
  const settings = useQuery(api.userSettings.get);
  const { saveSettings } = useUserSettingsSave();

  if (settings === undefined) {
    return (
      <SettingsPage title="Extension">
        <SettingsSection title="Browser extension" bodyVariant="list">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        </SettingsSection>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Extension">
      <SettingsSection
        title="Browser extension"
        description="How the vmem extension captures and syncs from the browser."
        bodyVariant="list"
      >
        <SettingsToggleRow
          htmlFor="ext-auto-sync"
          title="Auto-sync"
          description="Sync bookmarks and browsing history on a schedule."
          action={
            <Switch
              id="ext-auto-sync"
              checked={settings.extensionAutoSyncEnabled}
              onCheckedChange={(checked) => {
                void saveSettings({ extensionAutoSyncEnabled: checked });
              }}
            />
          }
        />
        <SettingsToggleRow
          htmlFor="ext-selection-popup"
          title="Save popup on text selection"
          description="Show a quick-save control when you select text on a page."
          action={
            <Switch
              id="ext-selection-popup"
              checked={settings.extensionSelectionPopupEnabled}
              onCheckedChange={(checked) => {
                void saveSettings({ extensionSelectionPopupEnabled: checked });
              }}
            />
          }
        />
      </SettingsSection>
    </SettingsPage>
  );
}
