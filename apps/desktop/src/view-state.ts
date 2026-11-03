import { z } from "zod";
import { formSettingsSchema } from "./settings-schema";

/** What main sends to the settings window. The window parses it at the boundary. */
export const viewStateSchema = z.object({
  settings: formSettingsSchema,
  auth: z.object({
    /** Not signed in, but an API key from an older install (or VMEM_API_KEY) still uploads. */
    usingSavedKey: z.boolean(),
  }),
});
export type ViewState = z.infer<typeof viewStateSchema>;
