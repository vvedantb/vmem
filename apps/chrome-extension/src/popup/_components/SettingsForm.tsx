import { useState, useEffect } from "react";
import { useClerk } from "@clerk/chrome-extension";
import { useQuery } from "convex/react";
import {
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconLogout,
  IconBrain,
  IconSend,
  IconCopy,
  IconRefresh,
  IconClock,
} from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  Skeleton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@vmem/ui";
import { api } from "@vmem/backend";
import { getStorage, setStorage } from "@/lib/storage";
import {
  VMEM_AI_SYSTEM_PROMPT,
  SYNC_INTERVAL_PRESETS,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  describeSyncInterval,
  shortSyncInterval,
} from "@/lib/constants";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { useExtensionUserSettings } from "@/popup/useExtensionUserSettings";
import { useBrowserDefaultProfile } from "@/popup/useBrowserDefaultProfile";
import { SettingsSelectRow } from "./SettingsSelectRow";
import { SettingsSwitchRow } from "./SettingsSwitchRow";
import { SettingsSliderRow } from "./SettingsSliderRow";
import { ProfileSelect } from "./ProfileSelect";

type Theme = "light" | "dark" | "system";

function isTheme(value: string): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

export function SettingsForm() {
  const { signOut } = useClerk();
  const { settings, update } = useExtensionUserSettings();
  const profiles = useQuery(api.profiles.list);
  const { effectiveProfileId, setSelectedProfileId } =
    useBrowserDefaultProfile(profiles);
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(true);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    void getStorage().then((s) => {
      setAutoSearchEnabled(s.autoSearchEnabled);
      setAutoCaptureEnabled(s.autoCaptureEnabled);
    });
  }, []);

  function handleThemeChange(value: string) {
    if (isTheme(value)) {
      void update({ theme: value });
    }
  }

  function handleSelectionPopupToggle(checked: boolean) {
    void update({ extensionSelectionPopupEnabled: checked });
  }

  function handleAutoSyncToggle(checked: boolean) {
    void update({ extensionAutoSyncEnabled: checked });
  }

  function handleSyncIntervalChange(minutes: number) {
    void update({ extensionAutoSyncIntervalMinutes: minutes });
  }

  function handleAutoSearchToggle(checked: boolean) {
    setAutoSearchEnabled(checked);
    void setStorage({ autoSearchEnabled: checked });
  }

  function handleAutoCaptureToggle(checked: boolean) {
    setAutoCaptureEnabled(checked);
    void setStorage({ autoCaptureEnabled: checked });
  }

  // per browser only never write to account wide default
  async function handleProfileChange(profileId: string) {
    setSelectedProfileId(profileId);
    await setStorage({ defaultProfileId: profileId });
  }

  async function handleCopyAiPrompt() {
    const copied = await copyTextToClipboard(VMEM_AI_SYSTEM_PROMPT);
    if (!copied) return;
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-medium text-foreground">Appearance</h3>
        <Card className="shadow-none">
          <CardContent className="space-y-6 p-4">
            <SettingsSelectRow label="Theme">
              <Select
                value={settings?.theme ?? "system"}
                onValueChange={handleThemeChange}
                disabled={settings === undefined}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <span className="flex items-center gap-2">
                      <IconSun size={14} />
                      Light
                    </span>
                  </SelectItem>
                  <SelectItem value="dark">
                    <span className="flex items-center gap-2">
                      <IconMoon size={14} />
                      Dark
                    </span>
                  </SelectItem>
                  <SelectItem value="system">
                    <span className="flex items-center gap-2">
                      <IconDeviceDesktop size={14} />
                      System
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingsSelectRow>

            <SettingsSelectRow
              label="Active profile"
              description="Where this browser saves new memories — set it separately in each Chrome profile."
            >
              {profiles === undefined ? (
                <Skeleton className="h-9 w-[160px] rounded-field" />
              ) : (
                <ProfileSelect
                  profiles={profiles}
                  value={effectiveProfileId}
                  onValueChange={handleProfileChange}
                  disabled={profiles.length === 0}
                />
              )}
            </SettingsSelectRow>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-medium text-foreground">Extension</h3>
        <Card className="shadow-none">
          <CardContent className="space-y-6 p-4">
            <SettingsSwitchRow
              id="selection-popup-toggle"
              label="Save popup on text selection"
              description="Show a quick-save chip when you highlight text on a page."
              checked={settings?.extensionSelectionPopupEnabled ?? true}
              onCheckedChange={handleSelectionPopupToggle}
              disabled={settings === undefined}
            />
            <SettingsSwitchRow
              id="auto-search-toggle"
              label="Auto-search memories in chats"
              description="Inject relevant memories when you send a message in ChatGPT or Claude."
              checked={autoSearchEnabled}
              onCheckedChange={handleAutoSearchToggle}
              icon={<IconBrain size={16} />}
            />
            <SettingsSwitchRow
              id="auto-capture-toggle"
              label="Auto-capture prompts"
              description="Save outgoing prompts from supported chat sites automatically."
              checked={autoCaptureEnabled}
              onCheckedChange={handleAutoCaptureToggle}
              icon={<IconSend size={16} />}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-medium text-foreground">Browsing sync</h3>
        <Card className="shadow-none">
          <CardContent className="space-y-6 p-4">
            <SettingsSwitchRow
              id="auto-sync-toggle"
              label="Auto-sync history & bookmarks"
              description="Periodically import new browsing history and bookmarks into your memories."
              checked={settings?.extensionAutoSyncEnabled ?? true}
              onCheckedChange={handleAutoSyncToggle}
              disabled={settings === undefined}
              icon={<IconRefresh size={16} />}
            />
            <SettingsSliderRow
              id="sync-frequency-slider"
              label="Sync frequency"
              description="How often to check for new history and bookmarks."
              value={
                settings?.extensionAutoSyncIntervalMinutes ??
                DEFAULT_SYNC_INTERVAL_MINUTES
              }
              presets={SYNC_INTERVAL_PRESETS}
              format={describeSyncInterval}
              formatShort={shortSyncInterval}
              onValueChange={handleSyncIntervalChange}
              disabled={
                settings === undefined || !settings.extensionAutoSyncEnabled
              }
              icon={<IconClock size={16} />}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-medium text-foreground">AI agents</h3>
        <Card className="shadow-none">
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                System prompt
              </p>
              <p className="mt-1 text-xs text-muted text-pretty">
                Copy the recommended vmem prompt and paste it into your AI
                agent&apos;s system prompt settings.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void handleCopyAiPrompt()}
            >
              <IconCopy size={16} stroke={1.8} />
              {promptCopied ? "Copied!" : "Copy vmem prompt"}
            </Button>
          </CardContent>
        </Card>
      </section>

      <Button
        variant="ghost"
        className="w-full text-danger hover:text-danger"
        onClick={() => signOut()}
      >
        <IconLogout size={16} stroke={1.8} />
        Sign out
      </Button>
    </div>
  );
}
