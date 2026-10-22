import { useState } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { Switch, SettingsSection, SettingsToggleRow } from "@vvedantb/ui";
import { api } from "@vmem/backend";
import { formatRelativeTime, SETTINGS_TEXT_MAX_LENGTH } from "@vmem/shared";
import ConfidenceThresholdSlider from "@/components/settings/ConfidenceThresholdSlider";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { useUserSettingsSave } from "@/hooks/useUserSettingsSave";
import { convexErrorMessage } from "@/lib/convex-error";
import { PreferenceTextareaRow } from "./PreferenceTextareaRow";
import { PreferencesPageSkeleton } from "./PreferencesPageSkeleton";

export function PreferencesPage() {
  const settings = useQuery(api.userSettings.get);
  const [aboutMeDraft, setAboutMeDraft] = useState<string | null>(null);
  const [preferencesDraft, setPreferencesDraft] = useState<string | null>(null);
  const { saveSettings, updateSettings } = useUserSettingsSave();
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
            maxLength={SETTINGS_TEXT_MAX_LENGTH}
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
            maxLength={SETTINGS_TEXT_MAX_LENGTH}
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
        description="How vmem cleans up and consolidates memories each night."
        bodyVariant="list"
      >
        <SettingsToggleRow
          htmlFor="dream-automatic"
          title="Nightly dreaming"
          description="Every night, merge duplicate memories and expire the ones past their end date. Each change can be undone for 30 days."
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
          htmlFor="dream-decay"
          title="Archive stale browsing history"
          description="Hide browsing history, bookmarks and desktop captures you have not visited for 30 days, opened at most twice and no AI has used."
          action={
            <Switch
              id="dream-decay"
              checked={settings.dreamModeDecay}
              onCheckedChange={(checked) => {
                void saveSettings({ dreamModeDecay: checked });
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
        <p className="px-4 py-3 text-xs text-muted">
          Last dreamt: {formatRelativeTime(settings.lastDreamRunAt)}
        </p>
      </SettingsSection>

      <SettingsSection
        title="Timeline"
        description="Summaries of what changed in your memory, shown on the memories timeline."
        bodyVariant="list"
      >
        <SettingsToggleRow
          htmlFor="rollups-enabled"
          title="Daily summaries (rollups)"
          description="Each night, write a short summary of the day's memory activity per workspace, then roll days up into weeks and months. Quiet days are skipped."
          action={
            <Switch
              id="rollups-enabled"
              checked={settings.rollupsEnabled}
              onCheckedChange={(checked) => {
                void saveSettings({ rollupsEnabled: checked });
              }}
            />
          }
        />
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
