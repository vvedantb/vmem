import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@vmem/ui";
import { IconBrandChrome } from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { patchDefaultProfile } from "@/lib/convex-optimistic";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";

type Profile = FunctionReturnType<typeof api.profiles.list>[number];

export function DefaultProfilesSection({ profiles }: { profiles: Profile[] }) {
  const settings = useQuery(api.userSettings.get);
  const setDefaultProfile = useMutation(
    api.userSettings.setDefaultProfile,
  ).withOptimisticUpdate((localStore, args) => {
    patchDefaultProfile(localStore, args.source, args.profileId);
  });

  const extensionDefaultId = settings?.defaultProfiles?.extension ?? null;

  const defaultProfile = profiles.find((p) => p.isDefault);
  const extensionDefault =
    profiles.find((p) => p._id === extensionDefaultId) ?? defaultProfile;

  const handleDefaultProfileChange = async (profileId: Profile["_id"]) => {
    try {
      await setDefaultProfile({
        source: "extension",
        profileId,
      });
      toast.success("Saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <SettingsSection
      title="Default profiles"
      description="Choose which profile new memories are saved to by default. In the web app, memories save to the active workspace."
    >
      <SettingsField
        htmlFor="default-extension-profile"
        label={
          <span className="inline-flex items-center gap-2">
            <IconBrandChrome className="h-4 w-4 text-muted" />
            Browser extension
          </span>
        }
        description="MCP clients will ask which profile to save to."
      >
        <Select
          value={extensionDefault?._id ?? ""}
          onValueChange={(value) => {
            const profile = profiles.find((p) => p._id === value);
            if (profile) void handleDefaultProfileChange(profile._id);
          }}
        >
          <SelectTrigger
            id="default-extension-profile"
            className="w-full max-sm:min-w-0 sm:max-w-[16rem]"
          >
            <SelectValue>
              {extensionDefault && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: extensionDefault.color }}
                  />
                  <span className="truncate">{extensionDefault.name}</span>
                </div>
              )}
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
      </SettingsField>
    </SettingsSection>
  );
}
