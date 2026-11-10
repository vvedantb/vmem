import { z } from "zod";

/**
 * Capture kinds written by the native collectors. `screen_text` (phase 2,
 * Accessibility) and `notification` (phase 3) are reserved: no collector
 * writes them yet, and the app leaves their events untouched.
 */
export const captureKindSchema = z.enum([
  "app_usage",
  "share",
  "note",
  "clipboard",
  "calendar",
  "screen_text",
  "notification",
]);
export type CaptureKind = z.infer<typeof captureKindSchema>;

export const queueStatusSchema = z.enum([
  "pending_review",
  "approved",
  "uploaded",
]);
export type QueueStatus = z.infer<typeof queueStatusSchema>;

export const rawEventSchema = z.object({
  id: z.number().int(),
  kind: captureKindSchema,
  package: z.string().nullable(),
  label: z.string().nullable(),
  startMs: z.number(),
  endMs: z.number(),
  text: z.string().nullable(),
  subject: z.string().nullable(),
});
export type RawEvent = z.infer<typeof rawEventSchema>;

export const queueRowSchema = z.object({
  id: z.number().int(),
  kind: captureKindSchema,
  status: queueStatusSchema,
  externalId: z.string(),
  /** Exact JSON body for `POST /api/v1/memories`. */
  body: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
});
export type QueueRow = z.infer<typeof queueRowSchema>;

export const trackerStatusSchema = z.object({
  paused: z.boolean(),
  usageAccess: z.boolean(),
  /** Calendar is off by default. On means the user chose it in Settings. */
  calendarEnabled: z.boolean(),
  /** READ_CALENDAR is granted. */
  calendarAccess: z.boolean(),
  /** Usage before this time is collected. 0 until the first run. */
  collectedThroughMs: z.number(),
  lastCollectAtMs: z.number(),
  lastCollectError: z.string().nullable(),
  tokenExpiresAtMs: z.number(),
  installId: z.string(),
  counts: z.object({
    events: z.number(),
    pendingReview: z.number(),
    approved: z.number(),
    uploaded: z.number(),
  }),
});
export type TrackerStatus = z.infer<typeof trackerStatusSchema>;

export const appEntrySchema = z.object({
  package: z.string(),
  label: z.string(),
  installed: z.boolean(),
});
export type AppEntry = z.infer<typeof appEntrySchema>;

export const recentAppSchema = z.object({
  package: z.string(),
  label: z.string(),
  lastUsedMs: z.number(),
});
export type RecentApp = z.infer<typeof recentAppSchema>;

const rawEventsSchema = z.array(rawEventSchema);
const queueRowsSchema = z.array(queueRowSchema);
const appEntriesSchema = z.array(appEntrySchema);
const recentAppsSchema = z.array(recentAppSchema);

/** A review item built by the app from raw events. */
export interface QueueItemInput {
  kind: CaptureKind;
  externalId: string;
  body: string;
  startMs: number;
  endMs: number;
}

/**
 * Applied by `promote` in one native transaction: insert `items` as
 * `pending_review`, delete the consumed events, and move the start of events
 * that still reach into an hour that is not over.
 */
export interface Promotion {
  items: QueueItemInput[];
  deleteEventIds: number[];
  trimEvents: { id: number; startMs: number }[];
}

/** The raw native module (`VmemTrackerModule.kt`). */
export interface VmemTrackerNative {
  getStatus(): Promise<string>;
  collectNow(): Promise<string>;
  readEvents(): Promise<string>;
  insertNote(text: string): Promise<void>;
  insertClipboard(text: string): Promise<void>;
  updateQueueBody(id: number, bodyJson: string): Promise<void>;
  promote(batchJson: string): Promise<number>;
  listQueue(): Promise<string>;
  approve(idsJson: string): Promise<number>;
  approveAll(): Promise<number>;
  discard(idsJson: string): Promise<void>;
  retry(idsJson: string): Promise<void>;
  markUploaded(id: number): Promise<void>;
  markFailed(id: number, error: string, countAttempt: boolean): Promise<void>;
  setPaused(paused: boolean): Promise<string>;
  getDenyList(): Promise<string>;
  setDenyList(packagesJson: string): Promise<void>;
  resetDenyList(): Promise<void>;
  listRecentApps(): Promise<string>;
  setAuthToken(token: string | null): Promise<void>;
  setCalendarEnabled(enabled: boolean): Promise<string>;
  setBaseUrl(url: string): Promise<void>;
  deleteAllData(): Promise<void>;
  openUsageAccessSettings(): void;
}

function parse<T>(schema: z.ZodType<T>, json: string): T {
  return schema.parse(JSON.parse(json));
}

const ids = (values: readonly number[]): string => JSON.stringify(values);

/** Typed wrapper: every value from native is parsed at this boundary. */
export function createTrackerApi(native: VmemTrackerNative) {
  return {
    getStatus: async () => parse(trackerStatusSchema, await native.getStatus()),
    collectNow: async () =>
      parse(trackerStatusSchema, await native.collectNow()),
    readEvents: async () => parse(rawEventsSchema, await native.readEvents()),
    insertNote: (text: string) => native.insertNote(text),
    insertClipboard: (text: string) => native.insertClipboard(text),
    updateQueueBody: (id: number, bodyJson: string) =>
      native.updateQueueBody(id, bodyJson),
    promote: (promotion: Promotion) =>
      native.promote(JSON.stringify(promotion)),
    listQueue: async () => parse(queueRowsSchema, await native.listQueue()),
    approve: (values: readonly number[]) => native.approve(ids(values)),
    approveAll: () => native.approveAll(),
    discard: (values: readonly number[]) => native.discard(ids(values)),
    retry: (values: readonly number[]) => native.retry(ids(values)),
    markUploaded: (id: number) => native.markUploaded(id),
    markFailed: (id: number, error: string, countAttempt: boolean) =>
      native.markFailed(id, error, countAttempt),
    setPaused: async (paused: boolean) =>
      parse(trackerStatusSchema, await native.setPaused(paused)),
    getDenyList: async () =>
      parse(appEntriesSchema, await native.getDenyList()),
    setDenyList: (packages: readonly string[]) =>
      native.setDenyList(JSON.stringify(packages)),
    resetDenyList: () => native.resetDenyList(),
    listRecentApps: async () =>
      parse(recentAppsSchema, await native.listRecentApps()),
    setAuthToken: (token: string | null) => native.setAuthToken(token),
    setCalendarEnabled: async (enabled: boolean) =>
      parse(trackerStatusSchema, await native.setCalendarEnabled(enabled)),
    setBaseUrl: (url: string) => native.setBaseUrl(url),
    deleteAllData: () => native.deleteAllData(),
    openUsageAccessSettings: () => native.openUsageAccessSettings(),
  };
}

export type TrackerApi = ReturnType<typeof createTrackerApi>;
