import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { Label, Switch, Skeleton } from "@vmem/ui";
import { api } from "@vmem/backend";
import { IconBrain, IconBell } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import ConfidenceThresholdSlider from "@/components/settings/ConfidenceThresholdSlider";

export const Route = createFileRoute("/_main/settings/preferences")({
  component: PreferencesPage,
});

function PreferencesPage() {
  const settings = useQuery(api.userSettings.get);
  const updateSettings = useMutation(api.userSettings.update);

  if (settings === undefined) {
    return (
      <PageContainer title="Preferences" centeredMaxWidth showTitle>
        <div className="space-y-12">
          <section className="space-y-6">
            <Skeleton className="h-5 w-48" />
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </section>
          <section className="space-y-6">
            <Skeleton className="h-5 w-48" />
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </section>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Preferences" centeredMaxWidth showTitle>
      <div className="space-y-12">
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <IconBrain className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-medium text-foreground">
              Memory Behavior
            </h3>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="auto-extract" className="text-sm font-medium">
                  Auto-extract memories
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Automatically extract memories from conversations.
                </p>
              </div>
              <Switch
                id="auto-extract"
                checked={settings.memoryAutoExtract}
                onCheckedChange={(checked) => {
                  void updateSettings({ memoryAutoExtract: checked });
                }}
              />
            </div>
            <ConfidenceThresholdSlider
              value={settings.memoryConfidenceThreshold}
              onChange={(value) => {
                void updateSettings({ memoryConfidenceThreshold: value });
              }}
            />
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <IconBell className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-medium text-foreground">
              Notification Preferences
            </h3>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label
                  htmlFor="notify-conflicts"
                  className="text-sm font-medium"
                >
                  Memory conflicts
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Notify when proposed updates conflict with existing memories.
                </p>
              </div>
              <Switch
                id="notify-conflicts"
                checked={settings.notifyMemoryConflicts}
                onCheckedChange={(checked) => {
                  void updateSettings({ notifyMemoryConflicts: checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label
                  htmlFor="notify-new-memories"
                  className="text-sm font-medium"
                >
                  New memories
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Notify when new memories are automatically extracted.
                </p>
              </div>
              <Switch
                id="notify-new-memories"
                checked={settings.notifyNewMemories}
                onCheckedChange={(checked) => {
                  void updateSettings({ notifyNewMemories: checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label
                  htmlFor="notify-expiring"
                  className="text-sm font-medium"
                >
                  Expiring memories
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Notify when memories are about to be archived.
                </p>
              </div>
              <Switch
                id="notify-expiring"
                checked={settings.notifyMemoriesExpiring}
                onCheckedChange={(checked) => {
                  void updateSettings({ notifyMemoriesExpiring: checked });
                }}
              />
            </div>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
