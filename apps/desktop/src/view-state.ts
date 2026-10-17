import { z } from "zod";
import { formSettingsSchema } from "./settings-schema";

/** What main sends to the settings window. The window parses it at the boundary. */
export const viewStateSchema = z.object({
  settings: formSettingsSchema,
  auth: z.object({
    signedIn: z.boolean(),
    signingIn: z.boolean(),
    /** Signed out, but an API key from an older install still works. */
    usingSavedKey: z.boolean(),
    email: z.string().optional(),
    name: z.string().optional(),
  }),
});
export type ViewState = z.infer<typeof viewStateSchema>;

/** Result of a window action (sign in, sign out). */
export const actionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});
export type ActionResult = z.infer<typeof actionResultSchema>;
