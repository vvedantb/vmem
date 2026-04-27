import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { Input, Label, Switch, Skeleton, Textarea } from "@vmem/ui";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import ConfidenceThresholdSlider from "@/components/settings/ConfidenceThresholdSlider";

/** Convert a stored UTC HH/MM into the user's local "HH:MM" picker string. */
function utcToLocalHHMM(utcHour: number, utcMinute: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, utcMinute, 0, 0);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Convert a local "HH:MM" picker value into a UTC hour/minute pair. */
function localHHMMToUtc(hhmm: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

const DEFAULT_LOCAL_TIME = "04:00";

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
  const setDreamSchedule = useMutation(api.dreamSchedule.setDreamSchedule);

  // Pulled out so the schedule section below stays readable.
  const handleScheduleToggle = async (enabled: boolean): Promise<void> => {
    if (settings === undefined) return;
    try {
      if (!enabled) {
        await setDreamSchedule({ enabled: false });
        toast.success("Daily Dream Mode disabled");
        return;
      }
      const savedHour = settings.dreamModeScheduleHour;
      const savedMinute = settings.dreamModeScheduleMinute;
      const utc =
        typeof savedHour === "number" && typeof savedMinute === "number"
          ? { hour: savedHour, minute: savedMinute }
          : localHHMMToUtc(DEFAULT_LOCAL_TIME);
      if (!utc) throw new Error("Invalid default time");
      await setDreamSchedule({
        enabled: true,
        hour: utc.hour,
        minute: utc.minute,
      });
      toast.success(
        `Daily Dream Mode scheduled for ${utcToLocalHHMM(utc.hour, utc.minute)}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update schedule",
      );
    }
  };

  const handleScheduleTimeChange = async (hhmm: string): Promise<void> => {
    if (settings === undefined) return;
    const utc = localHHMMToUtc(hhmm);
    if (!utc) {
      toast.error("Invalid time");
      return;
    }
    try {
      // Persist the new time. If the schedule is currently off we still save
      // it so flipping the toggle on later picks up the user's chosen time.
      await setDreamSchedule({
        enabled: settings.dreamModeScheduleEnabled,
        hour: utc.hour,
        minute: utc.minute,
      });
      if (settings.dreamModeScheduleEnabled) {
        toast.success(`Schedule updated to ${hhmm}`);
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
          <h3 className="text-base font-medium text-foreground">Dream Mode</h3>
          <p className="-mt-3 text-xs text-muted-foreground">
            Synthesize insights, connections, and anomalies across your personal
            memories. Applies to every personal profile. Team profiles keep
            their own per-team Dream Mode settings.
          </p>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label
                  htmlFor="dream-auto-accept"
                  className="text-sm font-medium"
                >
                  Auto-accept high-confidence synthesis
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  When on, high-confidence syntheses save as memories
                  automatically. Otherwise they queue in your inbox for
                  approval. Contradictions always queue regardless.
                </p>
              </div>
              <Switch
                id="dream-auto-accept"
                checked={settings.dreamModeAutoAccept}
                onCheckedChange={(checked) => {
                  void updateSettings({ dreamModeAutoAccept: checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="dream-schedule" className="text-sm font-medium">
                  Daily schedule
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Run Dream Mode every day at this time. Stored as UTC; the
                  local time shown shifts by an hour on DST transitions.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={
                    typeof settings.dreamModeScheduleHour === "number" &&
                    typeof settings.dreamModeScheduleMinute === "number"
                      ? utcToLocalHHMM(
                          settings.dreamModeScheduleHour,
                          settings.dreamModeScheduleMinute,
                        )
                      : DEFAULT_LOCAL_TIME
                  }
                  onChange={(e) => {
                    void handleScheduleTimeChange(e.target.value);
                  }}
                  className="h-8 w-[110px] text-xs"
                  aria-label="Dream Mode schedule time"
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
