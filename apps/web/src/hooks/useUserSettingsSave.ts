import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { toast } from "sonner";
import { api } from "@vmem/backend";

type UserSettingsPatch = FunctionArgs<typeof api.userSettings.update>;

export function useUserSettingsSave() {
  const updateSettings = useMutation(api.userSettings.update);

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
