import { useState, useEffect } from "react";
import { useClerk } from "@clerk/chrome-extension";
import {
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconLogout,
  IconBrain,
  IconSend,
} from "@tabler/icons-react";
import {
  Button,
  Label,
  Switch,
  Skeleton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@vmem/ui";
import { getStorage, setStorage } from "@/lib/storage";
import { useExtensionUserSettings } from "@/popup/useExtensionUserSettings";
import type { Profile } from "@/types/api";
import { listProfiles, setDefaultProfile } from "@/background/api-client";

type Theme = "light" | "dark" | "system";

export function SettingsForm() {
  const { signOut } = useClerk();
  const { settings, update } = useExtensionUserSettings();
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(true);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");

  useEffect(() => {
    getStorage().then((s) => {
      setAutoSearchEnabled(s.autoSearchEnabled);
      setAutoCaptureEnabled(s.autoCaptureEnabled);
      setSelectedProfileId(s.defaultProfileId);
    });

    // Load profiles
    void listProfiles()
      .then((profileList) => {
        setProfiles(profileList);
        // If no profile selected, use the default one
        getStorage().then((s) => {
          if (!s.defaultProfileId) {
            const defaultProfile = profileList.find((p) => p.isDefault);
            if (defaultProfile) {
              setSelectedProfileId(defaultProfile._id);
            }
          }
        });
      })
      .catch(() => {
        // Not authenticated yet
      });
  }, []);

  function handleThemeChange(value: string) {
    void update({ theme: value as Theme });
  }

  function handleSelectionPopupToggle(checked: boolean) {
    void update({ extensionSelectionPopupEnabled: checked });
  }

  function handleAutoSearchToggle(checked: boolean) {
    setAutoSearchEnabled(checked);
    setStorage({ autoSearchEnabled: checked });
  }

  function handleAutoCaptureToggle(checked: boolean) {
    setAutoCaptureEnabled(checked);
    setStorage({ autoCaptureEnabled: checked });
  }

  async function handleProfileChange(profileId: string) {
    setSelectedProfileId(profileId);
    await setStorage({ defaultProfileId: profileId });
    // Also sync to backend
    try {
      await setDefaultProfile(profileId);
    } catch {
      // Backend sync failed, but local storage is updated
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm">Theme</Label>
        <Select
          value={settings?.theme ?? "system"}
          onValueChange={handleThemeChange}
          disabled={settings === undefined}
        >
          <SelectTrigger className="w-[130px] h-9">
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
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm">Default Profile</Label>
        {profiles === null ? (
          <Skeleton className="h-9 w-[130px] rounded-md" />
        ) : (
          <Select
            value={selectedProfileId}
            onValueChange={handleProfileChange}
            disabled={profiles.length === 0}
          >
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue>
                {profiles.find((p) => p._id === selectedProfileId)?.name ??
                  "Select..."}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile._id} value={profile._id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: profile.color }}
                    />
                    <span>{profile.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="selection-popup-toggle" className="text-sm">
          Save popup on text selection
        </Label>
        <Switch
          id="selection-popup-toggle"
          checked={settings?.extensionSelectionPopupEnabled ?? true}
          onCheckedChange={handleSelectionPopupToggle}
          disabled={settings === undefined}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconBrain size={16} className="text-muted-foreground" />
          <Label htmlFor="auto-search-toggle" className="text-sm">
            Auto-search memories in chats
          </Label>
        </div>
        <Switch
          id="auto-search-toggle"
          checked={autoSearchEnabled}
          onCheckedChange={handleAutoSearchToggle}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconSend size={16} className="text-muted-foreground" />
          <Label htmlFor="auto-capture-toggle" className="text-sm">
            Auto-capture prompts
          </Label>
        </div>
        <Switch
          id="auto-capture-toggle"
          checked={autoCaptureEnabled}
          onCheckedChange={handleAutoCaptureToggle}
        />
      </div>

      <Button
        variant="ghost"
        className="w-full text-destructive hover:text-destructive"
        onClick={() => signOut()}
      >
        <IconLogout size={16} stroke={1.8} />
        Sign Out
      </Button>
    </div>
  );
}
