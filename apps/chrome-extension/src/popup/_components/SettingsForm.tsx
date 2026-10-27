import { useState, useEffect } from "react";
import { useClerk } from "@clerk/chrome-extension";
import { useQuery } from "convex/react";
import { useCopyToClipboard, useTimeout } from "usehooks-ts";
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
  LabeledSliderRow,
  Skeleton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SettingsField,
} from "@vvedantb/ui/client";
import { api } from "@vmem/backend";
import { handleNativeRangeKeyDown, isTheme } from "@vmem/shared";
import { getStorage, setStorage } from "@/lib/storage";
import { PopupSwitchRow } from "@/popup/_components/PopupSwitchRow";
import {
  VMEM_AI_SYSTEM_PROMPT,
  SYNC_INTERVAL_PRESETS,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  describeSyncInterval,
  shortSyncInterval,
  syncIntervalAt,
  syncIntervalIndex,
} from "@/lib/constants";
import { useExtensionUserSettings } from "@/popup/useExtensionUserSettings";
import { useBrowserDefaultProfile } from "@/popup/useBrowserDefaultProfile";
import { ProfileSelect } from "./ProfileSelect";

export function SettingsForm() {
  const { signOut } = useClerk();
  const { settings, update, setExtensionDefaultProfile } =
    useExtensionUserSettings();
  const profiles = useQuery(api.profiles.list);
  const { effectiveProfileId } = useBrowserDefaultProfile(profiles);
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(true);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [, copyToClipboard] = useCopyToClipboard();

  useTimeout(
    () => {
      setPromptCopied(false);
    },
    promptCopied ? 2000 : null,
  );

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

  const syncIndex = syncIntervalIndex(
    settings?.extensionAutoSyncIntervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES,
  );
  const syncRange = { min: 0, max: SYNC_INTERVAL_PRESETS.length - 1, step: 1 };

  function handleSyncIndexChange(index: number) {
    void update({ extensionAutoSyncIntervalMinutes: syncIntervalAt(index) });
  }

  function handleAutoSearchToggle(checked: boolean) {
    setAutoSearchEnabled(checked);
    void setStorage({ autoSearchEnabled: checked });
  }

  function handleAutoCaptureToggle(checked: boolean) {
    setAutoCaptureEnabled(checked);
    void setStorage({ autoCaptureEnabled: checked });
  }

  async function handleProfileChange(profileId: string) {
    const profile = profiles?.find((entry) => entry._id === profileId);
    if (!profile) return;
    await setExtensionDefaultProfile(profile._id);
  }

  async function handleCopyAiPrompt() {
    const copied = await copyToClipboard(VMEM_AI_SYSTEM_PROMPT);
    if (copied) setPromptCopied(true);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-medium text-foreground">Appearance</h3>
        <Card className="shadow-none">
          <CardContent className="space-y-6 p-4">
            <SettingsField layout="horizontal" label="Theme">
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
            </SettingsField>

            <SettingsField
              layout="horizontal"
              label="Active profile"
              description="Default profile for saving memories from this extension. Synced across browsers when signed in."
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
            </SettingsField>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-medium text-foreground">Extension</h3>
        <Card className="shadow-none">
          <CardContent className="space-y-6 p-4">
            <PopupSwitchRow
              id="selection-popup-toggle"
              label="Save popup on text selection"
              description="Show a quick-save chip when you highlight text on a page."
              checked={settings?.extensionSelectionPopupEnabled ?? true}
              onCheckedChange={handleSelectionPopupToggle}
              disabled={settings === undefined}
            />
            <PopupSwitchRow
              id="auto-search-toggle"
              label="Auto-search memories in chats"
              description="Inject relevant memories when you send a message in ChatGPT or Claude."
              checked={autoSearchEnabled}
              onCheckedChange={handleAutoSearchToggle}
              icon={<IconBrain size={16} />}
            />
            <PopupSwitchRow
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
            <PopupSwitchRow
              id="auto-sync-toggle"
              label="Auto-sync history & bookmarks"
              description="Periodically import new browsing history and bookmarks into your memories."
              checked={settings?.extensionAutoSyncEnabled ?? true}
              onCheckedChange={handleAutoSyncToggle}
              disabled={settings === undefined}
              icon={<IconRefresh size={16} />}
            />
            {/* capture runs before radix, which moves 10 steps on shift+arrow and page keys */}
            <div
              onKeyDownCapture={(event) =>
                handleNativeRangeKeyDown(
                  event,
                  syncIndex,
                  syncRange,
                  handleSyncIndexChange,
                )
              }
            >
              <LabeledSliderRow
                id="sync-frequency-slider"
                label="Sync frequency"
                description="How often to check for new history and bookmarks."
                {...syncRange}
                value={[syncIndex]}
                onValueChange={([index]) => {
                  if (index !== undefined) handleSyncIndexChange(index);
                }}
                formatValue={([index]) =>
                  describeSyncInterval(syncIntervalAt(index ?? syncIndex))
                }
                minLabel={shortSyncInterval(syncIntervalAt(syncRange.min))}
                maxLabel={shortSyncInterval(syncIntervalAt(syncRange.max))}
                disabled={
                  settings === undefined || !settings.extensionAutoSyncEnabled
                }
                icon={<IconClock size={16} />}
              />
            </div>
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
