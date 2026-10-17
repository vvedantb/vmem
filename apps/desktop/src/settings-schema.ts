import { z } from "zod";

export const settingsSchema = z.object({
  /** Legacy. Installs that saved an API key keep working until the user signs in; sign-in and sign-out clear it. */
  apiKey: z.string().default(""),
  /** safeStorage ciphertext (base64) of the OAuth client information and tokens. Empty when signed out. */
  oauthCipher: z.string().default(""),
  paused: z.boolean().default(false),
  idleThresholdMinutes: z.number().min(1).max(240).default(5),
  flushIntervalMinutes: z.number().min(1).max(240).default(15),
  clipboardEnabled: z.boolean().default(false),
  screenshotsEnabled: z.boolean().default(false),
  /** User additions. Built-in defaults live in blocklist.ts and always apply. */
  blocklist: z.array(z.string()).default([]),
  launchAtLogin: z.boolean().default(false),
});

export type Settings = z.infer<typeof settingsSchema>;

/** Every setting, for main-process updates. Old files with `baseUrl` still parse: Zod drops unknown keys. */
export const settingsPatchSchema = settingsSchema.partial();

/** The settings the window shows. Credentials never reach the renderer. */
export const formSettingsSchema = settingsSchema.pick({
  paused: true,
  idleThresholdMinutes: true,
  flushIntervalMinutes: true,
  clipboardEnabled: true,
  screenshotsEnabled: true,
  blocklist: true,
  launchAtLogin: true,
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

/** The only patch the window may send. */
export const formSettingsPatchSchema = formSettingsSchema.partial().strict();

export function defaultSettings(): Settings {
  return settingsSchema.parse({});
}
