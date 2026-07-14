import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Label,
  Switch,
  Skeleton,
  Textarea,
  TimePicker,
  Card,
  CardContent,
} from "@vmem/ui";
import { api } from "@vmem/backend";
import {
  DEFAULT_LOCAL_TIME,
  localTimeToUtc,
  utcTimeToLocal,
} from "@vmem/shared";
import PageContainer from "@/components/PageContainer";
import ConfidenceThresholdSlider from "@/components/settings/ConfidenceThresholdSlider";
import { formatRelativeTime } from "@/lib/formatters";
import { patchUserSettingsOptimistic } from "./-optimisticUserSettings";

export const Route = createFileRoute("/_main/settings/preferences")({
  component: PreferencesPage,
});

function PreferencesPage() {
  const settings = useQuery(api.userSettings.get);
  const aboutMeBaselineRef = useRef<string | null>(null);
  const preferencesBaselineRef = useRef<string | null>(null);
  // optimistic update patches the local query cache so the controlled
  // textareas stay in sync with keystrokes without waiting for the server
  const updateSettings = useMutation(
    api.userSettings.update,
  ).withOptimisticUpdate(patchUserSettingsOptimistic);
  const setDreamSchedule = useMutation(
    api.dreamSchedule.setDreamSchedule,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.userSettings.get, {});
    if (!current) return;
    localStore.setQuery(
      api.userSettings.get,
      {},
      {
        ...current,
        dreamModeScheduleEnabled: args.enabled,
        dreamModeScheduleTime: args.enabled ? (args.time ?? null) : null,
      },
    );
  });

  const saveSettings = async (
    patch: Parameters<typeof updateSettings>[0],
  ): Promise<void> => {
    try {
      await updateSettings(patch);
      toast.success("Saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const toastIfTextFieldChanged = (
    baselineRef: { current: string | null },
    current: string,
  ) => {
    const baseline = baselineRef.current;
    baselineRef.current = null;
    if (baseline !== null && baseline !== current) {
      toast.success("Saved!");
    }
  };

  // pulled out so the schedule section below stays readable
  const handleScheduleToggle = async (enabled: boolean): Promise<void> => {
    if (settings === undefined) return;
    try {
      if (!enabled) {
        await setDreamSchedule({ enabled: false });
        toast.success("Daily Dream Mode disabled");
        return;
      }
      const savedTime = settings.dreamModeScheduleTime;
      const utcTime = savedTime ?? localTimeToUtc(DEFAULT_LOCAL_TIME);
      if (utcTime === null) throw new Error("Invalid default time");
      await setDreamSchedule({ enabled: true, time: utcTime });
      toast.success(
        `Daily Dream Mode scheduled for ${utcTimeToLocal(utcTime)}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update schedule",
      );
    }
  };

  const handleScheduleTimeChange = async (localTime: string): Promise<void> => {
    if (settings === undefined) return;
    const utcTime = localTimeToUtc(localTime);
    if (utcTime === null) {
      toast.error("Invalid time");
      return;
    }
    try {
      // persist the new time. If the schedule is currently off we still save
      // it so flipping the toggle on later picks up the user's chosen time
      await setDreamSchedule({
        enabled: settings.dreamModeScheduleEnabled,
        time: utcTime,
      });
      if (settings.dreamModeScheduleEnabled) {
        toast.success(`Schedule updated to ${localTime}`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update schedule",
      );
    }
  };

  if (settings === undefined) {
    return (
      <PageContainer title="Preferences" centeredMaxWidth showTitle>
        <div className="space-y-8">
          <Card className="shadow-none">
            <CardContent className="space-y-6 p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
          {[1, 2, 3].map((section) => (
            <section key={section} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Card className="shadow-none">
                <CardContent className="space-y-6 p-6">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Preferences" centeredMaxWidth showTitle>
      <div className="space-y-8">
        <Card className="shadow-none">
          <CardContent className="space-y-6 p-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="about-me" className="text-sm font-medium">
                  About me
                </Label>
                <span className="text-xs text-muted tabular-nums">
                  {settings.aboutMe.length}/500
                </span>
              </div>
              <Textarea
                id="about-me"
                placeholder="A few lines on who you are, what you do, and what you're working toward."
                value={settings.aboutMe}
                onFocus={() => {
                  aboutMeBaselineRef.current = settings.aboutMe;
                }}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === settings.aboutMe) return;
                  void updateSettings({ aboutMe: next });
                }}
                onBlur={() => {
                  toastIfTextFieldChanged(aboutMeBaselineRef, settings.aboutMe);
                }}
                rows={4}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="preferences" className="text-sm font-medium">
                  Preferences
                </Label>
                <span className="text-xs text-muted tabular-nums">
                  {settings.preferences.length}/500
                </span>
              </div>
              <Textarea
                id="preferences"
                placeholder="How do you like AI to communicate with you? Tone, depth, formatting, things to avoid."
                value={settings.preferences}
                onFocus={() => {
                  preferencesBaselineRef.current = settings.preferences;
                }}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === settings.preferences) return;
                  void updateSettings({ preferences: next });
                }}
                onBlur={() => {
                  toastIfTextFieldChanged(
                    preferencesBaselineRef,
                    settings.preferences,
                  );
                }}
                rows={4}
                maxLength={500}
              />
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h3 className="text-base font-medium text-foreground text-balance">
            Memory Behavior
          </h3>
          <Card className="shadow-none">
            <CardContent className="space-y-6 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="auto-extract" className="text-sm font-medium">
                    Auto-extract memories
                  </Label>
                  <p className="mt-1 text-xs text-muted">
                    Automatically extract memories from conversations.
                  </p>
                </div>
                <Switch
                  id="auto-extract"
                  checked={settings.memoryAutoExtract}
                  onCheckedChange={(checked) => {
                    void saveSettings({ memoryAutoExtract: checked });
                  }}
                />
              </div>
              <ConfidenceThresholdSlider
                value={settings.memoryConfidenceThreshold}
                onChange={(value) => {
                  void saveSettings({ memoryConfidenceThreshold: value });
                }}
              />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-medium text-foreground text-balance">
            Dream Mode
          </h3>
          <Card className="shadow-none">
            <CardContent className="space-y-6 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label
                    htmlFor="dream-automatic"
                    className="text-sm font-medium"
                  >
                    Automatic dreaming
                  </Label>
                  <p className="mt-1 text-xs text-muted">
                    Dream on its own once you go quiet after saving new memories
                    — no schedule needed. Runs at most a few times a day, deeper
                    when more context piled up.
                  </p>
                </div>
                <Switch
                  id="dream-automatic"
                  checked={settings.dreamModeAutomatic}
                  onCheckedChange={(checked) => {
                    void saveSettings({ dreamModeAutomatic: checked });
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label
                    htmlFor="dream-auto-accept"
                    className="text-sm font-medium"
                  >
                    Auto-accept high-confidence synthesis
                  </Label>
                  <p className="mt-1 text-xs text-muted">
                    When on, high-confidence syntheses save as memories
                    automatically. Otherwise they queue in your inbox for
                    approval. Contradictions always queue regardless.
                  </p>
                </div>
                <Switch
                  id="dream-auto-accept"
                  checked={settings.dreamModeAutoAccept}
                  onCheckedChange={(checked) => {
                    void saveSettings({ dreamModeAutoAccept: checked });
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label
                    htmlFor="dream-schedule"
                    className="text-sm font-medium"
                  >
                    Daily schedule
                  </Label>
                  <p className="mt-1 text-xs text-muted">
                    Run Dream Mode every day at this time. Stored as UTC; the
                    local time shown shifts by an hour on DST transitions.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TimePicker
                    value={
                      settings.dreamModeScheduleTime !== null
                        ? utcTimeToLocal(settings.dreamModeScheduleTime)
                        : DEFAULT_LOCAL_TIME
                    }
                    onChange={(next) => {
                      void handleScheduleTimeChange(next);
                    }}
                    ariaLabel="Dream Mode schedule time"
                  />
                  <Switch
                    id="dream-schedule"
                    checked={settings.dreamModeScheduleEnabled}
                    onCheckedChange={(checked) => {
                      void handleScheduleToggle(checked);
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted">
                Last dreamt: {formatRelativeTime(settings.lastDreamRunAt)}
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-medium text-foreground text-balance">
            Notification Preferences
          </h3>
          <Card className="shadow-none">
            <CardContent className="space-y-6 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label
                    htmlFor="notify-conflicts"
                    className="text-sm font-medium"
                  >
                    Memory conflicts
                  </Label>
                  <p className="mt-1 text-xs text-muted">
                    Notify when proposed updates conflict with existing
                    memories.
                  </p>
                </div>
                <Switch
                  id="notify-conflicts"
                  checked={settings.notifyMemoryConflicts}
                  onCheckedChange={(checked) => {
                    void saveSettings({ notifyMemoryConflicts: checked });
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
                  <p className="mt-1 text-xs text-muted">
                    Notify when new memories are automatically extracted.
                  </p>
                </div>
                <Switch
                  id="notify-new-memories"
                  checked={settings.notifyNewMemories}
                  onCheckedChange={(checked) => {
                    void saveSettings({ notifyNewMemories: checked });
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
                  <p className="mt-1 text-xs text-muted">
                    Notify when memories are about to be archived.
                  </p>
                </div>
                <Switch
                  id="notify-expiring"
                  checked={settings.notifyMemoriesExpiring}
                  onCheckedChange={(checked) => {
                    void saveSettings({ notifyMemoriesExpiring: checked });
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}
