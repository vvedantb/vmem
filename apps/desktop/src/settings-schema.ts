import { z } from "zod";

const DEFAULT_BASE_URL = "https://clear-bear-690.eu-west-1.convex.site";

export const settingsSchema = z.object({
  apiKey: z.string().default(""),
  baseUrl: z.string().min(1).default(DEFAULT_BASE_URL),
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

export const settingsPatchSchema = settingsSchema.partial();

export function defaultSettings(): Settings {
  return settingsSchema.parse({});
}
