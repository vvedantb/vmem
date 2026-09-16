import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { Switch, TimePicker } from "@vmem/ui";
import { api } from "@vmem/backend";
import {
  DEFAULT_LOCAL_TIME,
  formatRelativeTime,
  localTimeToUtc,
  utcTimeToLocal,
} from "@vmem/shared";
import ConfidenceThresholdSlider from "@/components/settings/ConfidenceThresholdSlider";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/settings/SettingsToggleRow";
import { useUserSettingsSave } from "@/hooks/useUserSettingsSave";
import { convexErrorMessage } from "@/lib/convex-error";
import { PreferenceTextareaRow } from "./PreferenceTextareaRow";
import { PreferencesPageSkeleton } from "./PreferencesPageSkeleton";

export function PreferencesPage() {
  const settings = useQuery(api.userSettings.get);
  const [aboutMeDraft, setAboutMeDraft] = useState<string | null>(null);
  const [preferencesDraft, setPreferencesDraft] = useState<string | null>(null);
  const { saveSettings, updateSettings } = useUserSettingsSave();
  const setDreamSchedule = useMutation(
    api.dreamSchedule.setDreamSchedule,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.userSettings.get, {});
    if (current === undefined) return;
    localStore.setQuery(
      api.userSettings.get,
      {},
      {
        ...current,
        dreamModeScheduleEnabled: args.enabled,
        dreamModeScheduleTime:
          args.enabled && args.time !== undefined
            ? args.time
            : current.dreamModeScheduleTime,
      },
    );
  });

  const saveTextField = async (
    field: "aboutMe" | "preferences",
    draft: string | null,
    current: string,
    clearDraft: () => void,
  ): Promise<void> => {
    if (draft === null || draft === current) {
      clearDraft();
      return;
    }
    try {
      await updateSettings({ [field]: draft });
      clearDraft();
      toast.success("Saved!");
    } catch (err) {
      toast.error(convexErrorMessage(err, "Failed to save"));
    }
  };

  const handleScheduleToggle = async (enabled: boolean): Promise<void> => {
    if (settings === undefined) return;
    // resolved above the try React Compiler bails on the whole file for a `??`
    // inside one. localTimeToUtc is pure, so running it on the disable path too
    // costs nothing.
    const utcTime =
      settings.dreamModeScheduleTime ?? localTimeToUtc(DEFAULT_LOCAL_TIME);
    // a single if/else chain rather than an early return plus a throw React
    // compiler bails on the whole file for a ThrowStatement inside a try.
    try {
      if (!enabled) {
        await setDreamSchedule({ enabled: false });
        toast.success("Daily Dream Mode disabled");
      } else if (utcTime === null) {
        toast.error("Invalid default time");
      } else {
        await setDreamSchedule({ enabled: true, time: utcTime });
        toast.success(
          `Daily Dream Mode scheduled for ${utcTimeToLocal(utcTime)}`,
        );
      }
    } catch (err) {
      toast.error(convexErrorMessage(err, "Failed to update schedule"));
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
      await setDreamSchedule({
        enabled: settings.dreamModeScheduleEnabled,
        time: utcTime,
      });
      if (settings.dreamModeScheduleEnabled) {
        toast.success(`Schedule updated to ${localTime}`);
      }
    } catch (err) {
      toast.error(convexErrorMessage(err, "Failed to update schedule"));
    }
  };

  if (settings === undefined) {
    return <PreferencesPageSkeleton />;
  }

  const aboutMeValue = aboutMeDraft ?? settings.aboutMe;
  const preferencesValue = preferencesDraft ?? settings.preferences;

  return (
    <SettingsPage title="Preferences">
      <SettingsSection
        title="About you"
        description="How vmem should talk about you and how you like AI to communicate."
      >
        <div className="grid gap-5">
          <PreferenceTextareaRow
            id="about-me"
            label="About me"
            placeholder="A few lines on who you are, what you do, and what you're working toward."
            value={aboutMeValue}
            maxLength={500}
            rows={4}
            onFocus={() => {
              setAboutMeDraft(settings.aboutMe);
            }}
            onChange={setAboutMeDraft}
            onBlur={() => {
              void saveTextField(
                "aboutMe",
                aboutMeDraft,
                settings.aboutMe,
                () => {
                  setAboutMeDraft(null);
                },
              );
            }}
          />
          <PreferenceTextareaRow
            id="preferences"
            label="Preferences"
            placeholder="How do you like AI to communicate with you? Tone, depth, formatting, things to avoid."
            value={preferencesValue}
            maxLength={500}
            rows={4}
            onFocus={() => {
              setPreferencesDraft(settings.preferences);
            }}
            onChange={setPreferencesDraft}
            onBlur={() => {
              void saveTextField(
                "preferences",
                preferencesDraft,
                settings.preferences,
                () => {
                  setPreferencesDraft(null);
                },
              );
            }}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Memory behavior"
        description="What gets extracted from conversations, and how confident it has to be."
      >
        <div className="grid gap-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <label
                htmlFor="auto-extract"
                className="text-sm font-medium text-foreground"
              >
                Auto-extract memories
              </label>
              <p className="mt-1 text-pretty text-xs leading-relaxed text-muted">
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
        </div>
      </SettingsSection>

      <SettingsSection
        title="Dream Mode"
        description="How vmem consolidates memories when you go quiet."
        bodyVariant="list"
      >
        <SettingsToggleRow
          htmlFor="dream-automatic"
          title="Automatic dreaming"
          description="Dream on its own once you go quiet after saving new memories — no schedule needed. Runs at most a few times a day, deeper when more context piled up."
          action={
            <Switch
              id="dream-automatic"
              checked={settings.dreamModeAutomatic}
              onCheckedChange={(checked) => {
                void saveSettings({ dreamModeAutomatic: checked });
              }}
            />
          }
        />
        <SettingsToggleRow
          htmlFor="dream-auto-accept"
          title="Auto-accept high-confidence synthesis"
          description="When on, high-confidence syntheses save as memories automatically. Otherwise they queue in your inbox for approval. Contradictions always queue regardless."
          action={
            <Switch
              id="dream-auto-accept"
              checked={settings.dreamModeAutoAccept}
              onCheckedChange={(checked) => {
                void saveSettings({ dreamModeAutoAccept: checked });
              }}
            />
          }
        />
        <SettingsToggleRow
          htmlFor="dream-schedule"
          title="Daily schedule"
          description="Run Dream Mode every day at this time. Stored as UTC; the local time shown shifts by an hour on DST transitions."
          className="max-sm:flex-wrap"
          action={
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
          }
        />
        <p className="px-4 py-3 text-xs text-muted">
          Last dreamt: {formatRelativeTime(settings.lastDreamRunAt)}
        </p>
      </SettingsSection>

      <SettingsSection
        title="Notification preferences"
        description="Choose which events should ping you."
        bodyVariant="list"
      >
        <SettingsToggleRow
          htmlFor="notify-conflicts"
          title="Memory conflicts"
          description="Notify when proposed updates conflict with existing memories."
          action={
            <Switch
              id="notify-conflicts"
              checked={settings.notifyMemoryConflicts}
              onCheckedChange={(checked) => {
                void saveSettings({ notifyMemoryConflicts: checked });
              }}
            />
          }
        />
        <SettingsToggleRow
          htmlFor="notify-new-memories"
          title="New memories"
          description="Notify when new memories are automatically extracted."
          action={
            <Switch
              id="notify-new-memories"
              checked={settings.notifyNewMemories}
              onCheckedChange={(checked) => {
                void saveSettings({ notifyNewMemories: checked });
              }}
            />
          }
        />
        <SettingsToggleRow
          htmlFor="notify-expiring"
          title="Expiring memories"
          description="Notify when memories are about to be archived."
          action={
            <Switch
              id="notify-expiring"
              checked={settings.notifyMemoriesExpiring}
              onCheckedChange={(checked) => {
                void saveSettings({ notifyMemoriesExpiring: checked });
              }}
            />
          }
        />
      </SettingsSection>
    </SettingsPage>
  );
}
