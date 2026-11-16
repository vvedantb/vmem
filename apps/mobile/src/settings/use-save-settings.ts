import { api } from "@vmem/backend";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { convexErrorMessage } from "@/lib/convex-error";

type SettingsPatch = FunctionArgs<typeof api.userSettings.update>;

/** Saves part of the user settings and shows the result as a toast. */
export function useSaveSettings() {
  const update = useMutation(api.userSettings.update);
  return async (patch: SettingsPatch): Promise<boolean> => {
    try {
      await update(patch);
    } catch (err) {
      toast.error(convexErrorMessage(err, "Failed to save"));
      return false;
    }
    toast.success("Saved");
    return true;
  };
}
