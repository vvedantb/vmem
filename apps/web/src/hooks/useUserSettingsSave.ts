import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import {
  patchUserSettingsOptimistic,
  type UserSettingsPatch,
} from "@/lib/user-settings-optimistic";

export function useUserSettingsSave() {
  const updateSettings = useMutation(
    api.userSettings.update,
  ).withOptimisticUpdate(patchUserSettingsOptimistic);

  const saveSettings = async (patch: UserSettingsPatch): Promise<void> => {
    try {
      await updateSettings(patch);
      toast.success("Saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return { saveSettings, updateSettings };
}
