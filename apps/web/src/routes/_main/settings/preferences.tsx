import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { Label, Switch, Skeleton, Textarea } from "@vmem/ui";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import ConfidenceThresholdSlider from "@/components/settings/ConfidenceThresholdSlider";

export const Route = createFileRoute("/_main/settings/preferences")({
  component: PreferencesPage,
});

function PreferencesPage() {
  const settings = useQuery(api.userSettings.get);
  // Optimistic update patches the local query cache so the controlled
  // textareas stay in sync with keystrokes without waiting for the server.
  const updateSettings = useMutation(
    api.userSettings.update,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.userSettings.get, {});
    if (!current) return;
    localStore.setQuery(api.userSettings.get, {}, { ...current, ...args });
  });

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
          <h3 className="text-base font-medium text-foreground">About You</h3>
          <p className="-mt-3 text-xs text-muted-foreground">
            Shared automatically with AI apps alongside retrieved memories, so
            they can tailor responses to you.
          </p>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="about-me" className="text-sm font-medium">
                About me
              </Label>
              <Textarea
                id="about-me"
                placeholder="A few lines on who you are, what you do, and what you're working toward."
                value={settings.aboutMe}
                onChange={(e) => {
                  void updateSettings({ aboutMe: e.target.value });
                }}
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {settings.aboutMe.length}/500
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferences" className="text-sm font-medium">
                Preferences
              </Label>
              <Textarea
                id="preferences"
                placeholder="How do you like AI to communicate with you? Tone, depth, formatting, things to avoid."
                value={settings.preferences}
                onChange={(e) => {
                  void updateSettings({ preferences: e.target.value });
                }}
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {settings.preferences.length}/500
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h3 className="text-base font-medium text-foreground">
            Memory Behavior
          </h3>
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
          <h3 className="text-base font-medium text-foreground">
            Notification Preferences
          </h3>
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
