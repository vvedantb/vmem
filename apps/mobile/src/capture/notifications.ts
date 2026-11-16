import { z } from "zod";
import type {
  QueueItemInput,
  RawEvent,
} from "../../modules/vmem-tracker/src/api";
import { hash53 } from "./format";
import { memoryBody } from "./memory";
import { redactSecrets } from "./redact";
import { postForModel, utcOffsetMinutes } from "./server";

/**
 * Notifications become review items in two steps:
 *
 * 1. The native listener (NotificationCollector.kt) writes one raw
 *    `notification` event per posted notification: `label` is the app name,
 *    `subject` the title, `text` the body. It exists only when the user turned
 *    Notifications on and allowed Notification access. Blocked apps are skipped.
 * 2. On each sync the app sends the waiting notifications to the server
 *    (`POST /api/v1/mobile/notifications/digest`). The server keeps the few
 *    facts worth a memory. Each fact is one review item. If the digest fails,
 *    no item is made and the raw events stay for the next sync.
 */

/** Same limit as the server. The rest waits for the next sync. */
const MAX_PER_DIGEST = 300;
const SOURCE = "android-notification";

export interface PhoneNotification {
  /** Raw event id as text. */
  id: string;
  app: string;
  title: string;
  text: string;
  postedMs: number;
}

export const notificationDigestSchema = z.object({
  items: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      ids: z.array(z.string()),
    }),
  ),
});
export type NotificationDigest = z.infer<typeof notificationDigestSchema>;

export type DigestNotifications = (
  notifications: readonly PhoneNotification[],
) => Promise<NotificationDigest>;

/** The oldest waiting notifications, secrets masked. Empty ones go to `drainIds`. */
export function planNotifications(raw: readonly RawEvent[]): {
  notifications: PhoneNotification[];
  rawIds: number[];
  drainIds: number[];
} {
  const notifications: PhoneNotification[] = [];
  const rawIds: number[] = [];
  const drainIds: number[] = [];
  const waiting = raw
    .filter((event) => event.kind === "notification")
    .sort((a, b) => a.startMs - b.startMs);
  for (const event of waiting) {
    const text = redactSecrets(event.text ?? "").trim();
    if (text.length === 0) {
      drainIds.push(event.id);
      continue;
    }
    if (notifications.length >= MAX_PER_DIGEST) continue;
    rawIds.push(event.id);
    notifications.push({
      id: String(event.id),
      app: event.label ?? event.package ?? "Unknown app",
      title: redactSecrets(event.subject ?? ""),
      text,
      postedMs: event.startMs,
    });
  }
  return { notifications, rawIds, drainIds };
}

/** One review item per fact that names at least one notification the phone sent. */
export function notificationItems(
  notifications: readonly PhoneNotification[],
  digest: NotificationDigest,
  installId: string,
): QueueItemInput[] {
  const items: QueueItemInput[] = [];
  for (const fact of digest.items) {
    const sources = notifications.filter((known) =>
      fact.ids.includes(known.id),
    );
    if (sources.length === 0) continue;
    const apps = [...new Set(sources.map((source) => source.app))];
    const posted = sources.map((source) => source.postedMs);
    // Time and app, not the row id: row ids start again after "Delete all local data".
    const key = sources
      .map((source) => `${String(source.postedMs)}:${source.app}`)
      .join("|");
    const externalId = `android:notification:${hash53(`${installId}:${key}`)}`;
    items.push({
      kind: "notification",
      externalId,
      startMs: Math.min(...posted),
      endMs: Math.max(...posted),
      body: JSON.stringify(
        memoryBody({
          title: fact.title,
          content: `${fact.content}\n\nFrom phone notifications (${apps.join(", ")}).`,
          tags: ["notification"],
          externalId,
          source: SOURCE,
        }),
      ),
    });
  }
  return items;
}

export interface NotificationPromotion {
  items: QueueItemInput[];
  deleteEventIds: number[];
  /** Set when the digest failed. The notifications stay for the next sync. */
  errors: string[];
}

/**
 * Review items for the waiting notifications, after the server made a digest.
 * Turned off: deletes the raw events and makes nothing. A digest that fails
 * makes no item and keeps the raw events for the next sync.
 */
export async function buildNotificationPromotion(
  raw: readonly RawEvent[],
  options: { enabled: boolean; installId: string; digest: DigestNotifications },
): Promise<NotificationPromotion> {
  if (!options.enabled) {
    return {
      items: [],
      deleteEventIds: raw
        .filter((event) => event.kind === "notification")
        .map((event) => event.id),
      errors: [],
    };
  }
  const plan = planNotifications(raw);
  const result: NotificationPromotion = {
    items: [],
    deleteEventIds: [...plan.drainIds],
    errors: [],
  };
  if (plan.notifications.length === 0) return result;
  try {
    const digest = await options.digest(plan.notifications);
    result.items.push(
      ...notificationItems(plan.notifications, digest, options.installId),
    );
    // Noise is deleted too: the digest read it and kept nothing.
    result.deleteEventIds.push(...plan.rawIds);
  } catch (caught) {
    result.errors.push(
      caught instanceof Error ? caught.message : String(caught),
    );
  }
  return result;
}

/** Posts the notifications to the server. Throws an `Error` with a message for the user. */
export function httpDigester(options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): DigestNotifications {
  return (notifications) =>
    postForModel({
      ...options,
      path: "/api/v1/mobile/notifications/digest",
      body: {
        utcOffsetMinutes: utcOffsetMinutes(
          notifications[0]?.postedMs ?? Date.now(),
        ),
        notifications,
      },
      schema: notificationDigestSchema,
      label: "Notification digest",
      unavailable: "Notification digests are not available on the server yet.",
    });
}
