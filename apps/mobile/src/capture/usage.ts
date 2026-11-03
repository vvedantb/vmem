import type {
  QueueItemInput,
  RawEvent,
} from "../../modules/vmem-tracker/src/api";
import { formatDuration, slug, utcClock, utcRange } from "./format";
import { memoryBody } from "./memory";

const HOUR_MS = 3_600_000;

/** An app used for less than this in an hour makes no item. */
const MIN_ITEM_MS = 60_000;

/** Native stores a session per collection run; parts this close are one session. */
const JOIN_GAP_MS = 2_000;
const MAX_SESSIONS_LISTED = 8;

interface Piece {
  bucketStartMs: number;
  packageName: string;
  label: string;
  startMs: number;
  endMs: number;
}

export interface UsagePlan {
  items: QueueItemInput[];
  deleteEventIds: number[];
  trimEvents: { id: number; startMs: number }[];
}

function floorHour(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/** Splits [startMs, endMs) at UTC hour boundaries. */
function splitByHour(
  event: { startMs: number; endMs: number },
  base: Omit<Piece, "bucketStartMs" | "startMs" | "endMs">,
): Piece[] {
  const pieces: Piece[] = [];
  let start = event.startMs;
  while (start < event.endMs) {
    const bucketStartMs = floorHour(start);
    const end = Math.min(event.endMs, bucketStartMs + HOUR_MS);
    pieces.push({ ...base, bucketStartMs, startMs: start, endMs: end });
    start = end;
  }
  return pieces;
}

function joinSessions(pieces: readonly Piece[]): Piece[] {
  const sorted = [...pieces].sort((a, b) => a.startMs - b.startMs);
  const out: Piece[] = [];
  for (const piece of sorted) {
    const last = out.at(-1);
    if (last && piece.startMs - last.endMs <= JOIN_GAP_MS) {
      out[out.length - 1] = {
        ...last,
        endMs: Math.max(last.endMs, piece.endMs),
      };
    } else {
      out.push(piece);
    }
  }
  return out;
}

/** Stable per phone, app and UTC hour, so a retry updates the same memory. */
export function usageExternalId(
  installId: string,
  packageName: string,
  bucketStartMs: number,
): string {
  const hour = new Date(bucketStartMs).toISOString().slice(0, 13);
  return `android:usage:${installId}:${packageName}:${hour}`;
}

function usageItem(
  pieces: readonly Piece[],
  installId: string,
): QueueItemInput | null {
  const first = pieces[0];
  if (!first) return null;
  const sessions = joinSessions(pieces);
  const totalMs = sessions.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
  if (totalMs < MIN_ITEM_MS) return null;
  const startMs = sessions[0]?.startMs ?? first.startMs;
  const endMs = sessions.at(-1)?.endMs ?? first.endMs;
  // The newest label wins: an app can be renamed by an update.
  const label = pieces.at(-1)?.label ?? first.label;
  const duration = formatDuration(totalMs);
  const count = sessions.length;

  const lines = [
    `Active in ${label} on Android from ${utcRange(startMs, endMs)}.`,
    `Screen time: ${duration} over ${String(count)} session${count === 1 ? "" : "s"}.`,
    `App id: ${first.packageName}`,
    "Sessions (UTC):",
    ...sessions
      .slice(0, MAX_SESSIONS_LISTED)
      .map(
        (s) =>
          `- ${utcClock(s.startMs)} to ${utcClock(s.endMs)} (${formatDuration(s.endMs - s.startMs)})`,
      ),
  ];
  if (count > MAX_SESSIONS_LISTED) {
    lines.push(`- and ${String(count - MAX_SESSIONS_LISTED)} more`);
  }

  const externalId = usageExternalId(
    installId,
    first.packageName,
    first.bucketStartMs,
  );
  const body = memoryBody({
    title: `Used ${label} for ${duration}`,
    content: lines.join("\n"),
    tags: ["activity", slug(label) || slug(first.packageName)],
    externalId,
  });
  return {
    kind: "app_usage",
    externalId,
    body: JSON.stringify(body),
    startMs,
    endMs,
  };
}

/**
 * Batches raw usage sessions into one review item per app per UTC hour.
 *
 * Only hours that are over (`collectedThroughMs` is past their end) become
 * items, so an item never grows after the user sees it. Events fully inside
 * finished hours are deleted; an event that reaches into the current hour is
 * trimmed to start there. Apps used under a minute in an hour are dropped.
 */
export function planUsage(
  events: readonly RawEvent[],
  options: { collectedThroughMs: number; installId: string },
): UsagePlan {
  const closedBefore = floorHour(options.collectedThroughMs);
  const pieces: Piece[] = [];
  const deleteEventIds: number[] = [];
  const trimEvents: { id: number; startMs: number }[] = [];

  for (const event of events) {
    if (event.kind !== "app_usage" || event.package === null) continue;
    if (event.startMs >= closedBefore) continue;
    const closedEnd = Math.min(event.endMs, closedBefore);
    if (event.endMs <= closedBefore) deleteEventIds.push(event.id);
    else trimEvents.push({ id: event.id, startMs: closedBefore });
    pieces.push(
      ...splitByHour(
        { startMs: event.startMs, endMs: closedEnd },
        { packageName: event.package, label: event.label ?? event.package },
      ),
    );
  }

  const groups = new Map<string, Piece[]>();
  for (const piece of pieces) {
    const key = `${String(piece.bucketStartMs)}|${piece.packageName}`;
    const group = groups.get(key);
    if (group) group.push(piece);
    else groups.set(key, [piece]);
  }

  const items = [...groups.values()]
    .map((group) => usageItem(group, options.installId))
    .filter((item): item is QueueItemInput => item !== null)
    .sort((a, b) => a.startMs - b.startMs);

  return { items, deleteEventIds, trimEvents };
}
