import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  LabeledSwitchRow,
  Switch,
  TimePicker,
} from "@vmem/ui";
import { api } from "@vmem/backend";
import {
  DEFAULT_LOCAL_TIME,
  formatRelativeTime,
  localTimeToUtc,
  utcTimeToLocal,
} from "@vmem/shared";
import PageContainer from "@/components/shell/PageContainer";
import ConfidenceThresholdSlider from "@/components/settings/ConfidenceThresholdSlider";
import { useUserSettingsSave } from "@/hooks/useUserSettingsSave";
import { PreferenceSection } from "./PreferenceSection";
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
      toast.error(err instanceof Error ? err.message : "Failed to save");
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
    return <PreferencesPageSkeleton />;
  }

  const aboutMeValue = aboutMeDraft ?? settings.aboutMe;
  const preferencesValue = preferencesDraft ?? settings.preferences;

  return (
    <PageContainer title="Preferences" centeredMaxWidth showTitle>
      <div className="space-y-8">
        <Card className="shadow-none">
          <CardContent className="space-y-6 p-6">
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
          </CardContent>
        </Card>

        <PreferenceSection title="Memory Behavior">
          <LabeledSwitchRow
            id="auto-extract"
            label="Auto-extract memories"
            description="Automatically extract memories from conversations."
            checked={settings.memoryAutoExtract}
            onCheckedChange={(checked) => {
              void saveSettings({ memoryAutoExtract: checked });
            }}
          />
          <div>
            <ConfidenceThresholdSlider
              value={settings.memoryConfidenceThreshold}
              onChange={(value) => {
                void saveSettings({ memoryConfidenceThreshold: value });
              }}
            />
          </div>
        </PreferenceSection>

        <PreferenceSection title="Dream Mode">
          <LabeledSwitchRow
            id="dream-automatic"
            label="Automatic dreaming"
            description="Dream on its own once you go quiet after saving new memories — no schedule needed. Runs at most a few times a day, deeper when more context piled up."
            checked={settings.dreamModeAutomatic}
            onCheckedChange={(checked) => {
              void saveSettings({ dreamModeAutomatic: checked });
            }}
          />
          <LabeledSwitchRow
            id="dream-auto-accept"
            label="Auto-accept high-confidence synthesis"
            description="When on, high-confidence syntheses save as memories automatically. Otherwise they queue in your inbox for approval. Contradictions always queue regardless."
            checked={settings.dreamModeAutoAccept}
            onCheckedChange={(checked) => {
              void saveSettings({ dreamModeAutoAccept: checked });
            }}
          />
          <LabeledSwitchRow
            id="dream-schedule"
            label="Daily schedule"
            description="Run Dream Mode every day at this time. Stored as UTC; the local time shown shifts by an hour on DST transitions."
            checked={settings.dreamModeScheduleEnabled}
            trailing={
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
          <p className="text-xs text-muted">
            Last dreamt: {formatRelativeTime(settings.lastDreamRunAt)}
          </p>
        </PreferenceSection>

        <PreferenceSection title="Notification Preferences">
          <LabeledSwitchRow
            id="notify-conflicts"
            label="Memory conflicts"
            description="Notify when proposed updates conflict with existing memories."
            checked={settings.notifyMemoryConflicts}
            onCheckedChange={(checked) => {
              void saveSettings({ notifyMemoryConflicts: checked });
            }}
          />
          <LabeledSwitchRow
            id="notify-new-memories"
            label="New memories"
            description="Notify when new memories are automatically extracted."
            checked={settings.notifyNewMemories}
            onCheckedChange={(checked) => {
              void saveSettings({ notifyNewMemories: checked });
            }}
          />
          <LabeledSwitchRow
            id="notify-expiring"
            label="Expiring memories"
            description="Notify when memories are about to be archived."
            checked={settings.notifyMemoriesExpiring}
            onCheckedChange={(checked) => {
              void saveSettings({ notifyMemoriesExpiring: checked });
            }}
          />
        </PreferenceSection>
      </div>
    </PageContainer>
  );
}
