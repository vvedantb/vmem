import { getClerkInstance } from "@clerk/clerk-expo";
import { toast } from "@vvedantb/native-ui/toast";
import * as Clipboard from "expo-clipboard";
import { useSyncExternalStore } from "react";
import {
  AppState,
  PermissionsAndroid,
  type AppStateStatus,
} from "react-native";
import {
  tracker,
  type AppEntry,
  type QueueRow,
  type RecentApp,
  type TrackerStatus,
} from "../../modules/vmem-tracker";
import { z } from "zod";
import { redactSecrets } from "../capture/redact";
import { withShareNote } from "../capture/share";
import {
  buildCalendarPromotion,
  httpSummarizer,
  type SummarizeDay,
} from "../capture/calendar";
import { buildPromotion, isEmptyPromotion } from "../capture/promote";
import { VMEM_BASE_URL } from "../config";
import { toError } from "../errors";
import { createPoster, parseBody, uploadApproved } from "./upload";

/**
 * App state that lives in the native module (status, queue, blocked apps).
 * Screens read it with `useTracker()`; the first subscriber starts syncing
 * on app open and on every return to the foreground.
 */
export interface TrackerSnapshot {
  status: TrackerStatus | null;
  queue: QueueRow[];
  denyList: AppEntry[];
  recentApps: RecentApp[];
  syncing: boolean;
}

let snapshot: TrackerSnapshot = {
  status: null,
  queue: [],
  denyList: [],
  recentApps: [],
  syncing: false,
};

const listeners = new Set<() => void>();
let appStateSubscription: { remove: () => void } | null = null;
let inFlight: Promise<void> | null = null;

function update(patch: Partial<TrackerSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function report(error: Error): void {
  toast.error("Something went wrong", { description: error.message });
}

/** Runs an action and reports a failure as a toast, so a press never throws. */
async function guarded(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (caught) {
    report(toError(caught));
  }
}

/**
 * A newly minted session JWT (about 60 s lifetime), never the cached one.
 * Also handed to the native module so WorkManager can upload with it while
 * it is still valid.
 */
async function freshToken(): Promise<string | null> {
  const session = getClerkInstance().session;
  const token = session ? await session.getToken({ skipCache: true }) : null;
  await tracker.setAuthToken(token);
  return token;
}

async function reload(): Promise<void> {
  const [status, queue, denyList] = await Promise.all([
    tracker.getStatus(),
    tracker.listQueue(),
    tracker.getDenyList(),
  ]);
  update({ status, queue, denyList });
}

async function upload(): Promise<void> {
  const result = await uploadApproved({
    tracker,
    // Never the cached token: it can be seconds from expiry.
    connect: async () => {
      const token = await freshToken();
      return token ? createPoster(token, VMEM_BASE_URL) : null;
    },
  });
  // The server rejected this token, so the native worker must not reuse it.
  // Items stay approved and upload on the next sync with a new token.
  if (result.outcome === "auth-failed") await tracker.setAuthToken(null);
  if (result.uploaded > 0 || result.outcome !== "done") await reload();
}

/** Summarises on the server with a fresh token. Fails when signed out. */
const summarizeDay: SummarizeDay = async (day, events) => {
  const token = await freshToken();
  if (!token) throw new Error("Sign in again to summarise your calendar.");
  return httpSummarizer({ baseUrl: VMEM_BASE_URL, token })(day, events);
};

async function runSync(): Promise<void> {
  update({ syncing: true });
  try {
    await tracker.setBaseUrl(VMEM_BASE_URL);
    const status = await tracker.collectNow();
    const events = await tracker.readEvents();
    const usage = buildPromotion(events, {
      collectedThroughMs: status.collectedThroughMs,
      installId: status.installId,
    });
    const calendar = await buildCalendarPromotion(events, {
      enabled: status.calendarEnabled && status.calendarAccess,
      installId: status.installId,
      summarize: summarizeDay,
    });
    const promotion = {
      items: [...usage.items, ...calendar.items],
      deleteEventIds: [...usage.deleteEventIds, ...calendar.deleteEventIds],
      trimEvents: usage.trimEvents,
    };
    const [firstError] = calendar.errors;
    if (firstError !== undefined) {
      toast.error("Calendar summary failed", { description: firstError });
    }
    if (!isEmptyPromotion(promotion)) await tracker.promote(promotion);
    await reload();
    await upload();
  } finally {
    update({ syncing: false });
  }
}

/** Collect, build review items, upload approved ones. One run at a time. */
function sync(): Promise<void> {
  inFlight ??= guarded(runSync).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function onAppStateChange(state: AppStateStatus): void {
  if (state === "active") {
    void sync();
  } else if (state === "background") {
    // A full-length token lets WorkManager finish approved uploads after the app closes.
    void guarded(async () => {
      await freshToken();
    });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (appStateSubscription === null) {
    appStateSubscription = AppState.addEventListener(
      "change",
      onAppStateChange,
    );
    void sync();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      appStateSubscription?.remove();
      appStateSubscription = null;
    }
  };
}

const getSnapshot = (): TrackerSnapshot => snapshot;

export function useTracker(): TrackerSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Builds review items from a capture that was just inserted. */
async function syncAfterCapture(): Promise<void> {
  // A run that started before the insert may not see it; wait, then run again.
  if (inFlight) await inFlight;
  await sync();
}

const transcriptSchema = z.object({ text: z.string() });

async function transcribe(audioUri: string): Promise<string> {
  const token = await freshToken();
  if (!token) throw new Error("Sign in again to use voice notes.");
  const form = new FormData();
  // React Native reads a local file URI through fetch.
  const audio = await (await fetch(audioUri)).blob();
  form.append("file", audio, "note.m4a");
  const response = await fetch(`${VMEM_BASE_URL}/api/v1/mobile/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Voice note failed (HTTP ${String(response.status)})`);
  }
  return transcriptSchema.parse(await response.json()).text;
}

async function afterApprove(): Promise<void> {
  await reload();
  await upload();
}

export const trackerActions = {
  refresh: () => sync(),
  approve: (ids: readonly number[]) =>
    guarded(async () => {
      await tracker.approve(ids);
      await afterApprove();
    }),
  approveAll: () =>
    guarded(async () => {
      await tracker.approveAll();
      await afterApprove();
    }),
  discard: (ids: readonly number[]) =>
    guarded(async () => {
      await tracker.discard(ids);
      await reload();
    }),
  retry: (ids: readonly number[]) =>
    guarded(async () => {
      await tracker.retry(ids);
      await afterApprove();
    }),
  /** Saves a note the user wrote or dictated. It lands in Review. */
  saveNote: (text: string) =>
    guarded(async () => {
      if (text.trim().length === 0) return;
      await tracker.insertNote(text);
      await syncAfterCapture();
    }),
  /** Reads the clipboard now, because the user tapped. Never in the background. */
  saveClipboard: () =>
    guarded(async () => {
      const text = redactSecrets(await Clipboard.getStringAsync()).trim();
      if (text.length === 0) {
        toast.info("The clipboard is empty");
        return;
      }
      await tracker.insertClipboard(text);
      await syncAfterCapture();
    }),
  /** Adds the user's note to a share that waits in Review. */
  addShareNote: (row: QueueRow, note: string) =>
    guarded(async () => {
      const body = parseBody(row);
      if (body === null || note.trim().length === 0) return;
      await tracker.updateQueueBody(row.id, withShareNote(body, note));
      await reload();
    }),
  /** Sends a voice recording to the server and returns the text, or null on failure. */
  transcribeVoice: async (audioUri: string): Promise<string | null> => {
    try {
      return await transcribe(audioUri);
    } catch (caught) {
      report(toError(caught));
      return null;
    }
  },
  /** Turns Calendar on only when the user allows READ_CALENDAR. Off by default. */
  setCalendar: (on: boolean) =>
    guarded(async () => {
      if (on) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CALENDAR,
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          toast.info("Calendar stays off", {
            description:
              "vmem needs the Calendar permission. You can allow it in Android Settings, under Apps, vmem, Permissions.",
          });
          return;
        }
      }
      update({ status: await tracker.setCalendarEnabled(on) });
      await sync();
    }),
  setPaused: (paused: boolean) =>
    guarded(async () => {
      update({ status: await tracker.setPaused(paused) });
      // Pausing collected up to now; turn that into review items.
      if (paused) await sync();
    }),
  openUsageAccessSettings: () => {
    tracker.openUsageAccessSettings();
  },
  block: (packageName: string) =>
    guarded(async () => {
      const name = packageName.trim();
      if (name.length === 0) return;
      const current = snapshot.denyList.map((entry) => entry.package);
      await tracker.setDenyList([...new Set([...current, name])]);
      await reload();
    }),
  unblock: (packageName: string) =>
    guarded(async () => {
      const next = snapshot.denyList
        .map((entry) => entry.package)
        .filter((name) => name !== packageName);
      await tracker.setDenyList(next);
      await reload();
    }),
  resetBlocked: () =>
    guarded(async () => {
      await tracker.resetDenyList();
      await reload();
    }),
  loadRecentApps: () =>
    guarded(async () => {
      update({ recentApps: await tracker.listRecentApps() });
    }),
  /** Queue, raw captures and the token. Settings stay. */
  deleteAllLocalData: () =>
    guarded(async () => {
      await tracker.deleteAllData();
      await reload();
    }),
};
