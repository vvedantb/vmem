import { z } from "zod";
import {
  CONFIDENCE_THRESHOLD_MAX,
  CONFIDENCE_THRESHOLD_MIN,
  MAX_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_INTERVAL_MINUTES,
  SETTINGS_TEXT_MAX_LENGTH,
} from "@vmem/shared";
import { internal } from "../_generated/api";
import { emptyInputSchema, toolSpec } from "./toolTypes";

// Settings are user-wide, so these tools are on the personal connector only.

const settingsTextSchema = z.string().max(SETTINGS_TEXT_MAX_LENGTH).optional();
const settingsFlagSchema = z.boolean().optional();

// the userSettings.update fields, with the limits the settings UIs use
const settingsUpdateSchema = z.object({
  aboutMe: settingsTextSchema.describe(
    `About me: who you are, for every AI client (max ${SETTINGS_TEXT_MAX_LENGTH} characters)`,
  ),
  preferences: settingsTextSchema.describe(
    `How you like AI to communicate with you (max ${SETTINGS_TEXT_MAX_LENGTH} characters)`,
  ),
  memoryAutoExtract: settingsFlagSchema.describe(
    "Auto-extract memories from conversations",
  ),
  memoryConfidenceThreshold: z
    .number()
    .int()
    .min(CONFIDENCE_THRESHOLD_MIN)
    .max(CONFIDENCE_THRESHOLD_MAX)
    .optional()
    .describe(
      `Only extract memories at or above this confidence (${CONFIDENCE_THRESHOLD_MIN}-${CONFIDENCE_THRESHOLD_MAX})`,
    ),
  memoryAutoTag: settingsFlagSchema.describe("Auto-tag new memories"),
  dreamModeAutomatic: settingsFlagSchema.describe(
    "Automatic dreaming as memories change",
  ),
  dreamModeAutoAccept: settingsFlagSchema.describe(
    "Apply Dream Mode merges without an inbox proposal",
  ),
  notificationsEnabled: settingsFlagSchema.describe("Notifications on"),
  notifyMemoryConflicts: settingsFlagSchema.describe(
    "Notify on memory conflicts",
  ),
  notifyNewMemories: settingsFlagSchema.describe("Notify on new memories"),
  notifyMemoriesExpiring: settingsFlagSchema.describe(
    "Notify when memories are expiring",
  ),
  theme: z.enum(["light", "dark", "system"]).optional().describe("UI theme"),
  language: z
    .string()
    .min(2)
    .max(35)
    .optional()
    .describe("Language tag, e.g. en"),
  extensionAutoSyncEnabled: settingsFlagSchema.describe(
    "Chrome extension: auto-sync history and bookmarks",
  ),
  extensionAutoSyncIntervalMinutes: z
    .number()
    .int()
    .min(MIN_SYNC_INTERVAL_MINUTES)
    .max(MAX_SYNC_INTERVAL_MINUTES)
    .optional()
    .describe(
      `Chrome extension sync interval in minutes (${MIN_SYNC_INTERVAL_MINUTES}-${MAX_SYNC_INTERVAL_MINUTES})`,
    ),
  extensionSelectionPopupEnabled: settingsFlagSchema.describe(
    "Chrome extension: show the save popup on text selection",
  ),
});

const dreamScheduleSetSchema = z.object({
  enabled: z.boolean().describe("true turns the daily Dream Mode run on"),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .describe("Daily run time in UTC, HH:MM (required when enabled)"),
});

const experimentalFlagSchema = z.object({
  key: z.enum(["disablePageMotion"]).describe("Experimental flag key"),
  enabled: z.boolean(),
});

export const settingsToolSpecs = {
  settings_get: toolSpec({
    name: "settings_get",
    schema: emptyInputSchema,
    description:
      "Read all your vmem settings (the web Preferences and Extension pages): aboutMe, preferences, memory extraction, Dream Mode (automatic, auto-accept, daily schedule, lastDreamRunAt), notifications, theme, extension sync, default profiles per source and experimentalFlags.",
    errorLabel: "Get settings failed",
    scopes: ["personal"],
    async run(h): Promise<unknown> {
      return h.ctx.runQuery(internal.userSettings.getByClerkIdInternal, {
        clerkId: h.clerkUserId,
      });
    },
  }),
  settings_update: toolSpec({
    name: "settings_update",
    schema: settingsUpdateSchema,
    description:
      "Change one or more settings; omitted fields stay as they are. Use dream_schedule_set for the daily Dream Mode time and set_active_profile for default profiles.",
    errorLabel: "Update settings failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      if (Object.values(params).every((value) => value === undefined)) {
        throw new Error("Pass at least one setting to change");
      }
      await h.ctx.runMutation(internal.userSettings.updateByClerkIdInternal, {
        clerkId: h.clerkUserId,
        patch: params,
      });
      return h.ctx.runQuery(internal.userSettings.getByClerkIdInternal, {
        clerkId: h.clerkUserId,
      });
    },
  }),
  dream_schedule_set: toolSpec({
    name: "dream_schedule_set",
    schema: dreamScheduleSetSchema,
    description:
      "Turn the daily Dream Mode run on at a UTC time (HH:MM), or off, as on the web Preferences page.",
    errorLabel: "Set dream schedule failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      await h.ctx.runMutation(
        internal.dreamSchedule.setDreamScheduleByClerkIdInternal,
        { clerkId: h.clerkUserId, ...params },
      );
      return {
        enabled: params.enabled,
        time: params.enabled ? (params.time ?? null) : null,
      };
    },
  }),
  settings_set_experimental_flag: toolSpec({
    name: "settings_set_experimental_flag",
    schema: experimentalFlagSchema,
    description:
      "Turn an experimental web option on or off (Settings > Experimental). disablePageMotion turns off page transitions.",
    errorLabel: "Set experimental flag failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      await h.ctx.runMutation(
        internal.userSettings.setExperimentalFlagByClerkIdInternal,
        { clerkId: h.clerkUserId, ...params },
      );
      return params;
    },
  }),
};
