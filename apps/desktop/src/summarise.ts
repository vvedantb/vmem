import type { ActivityEvent } from "./events";

export interface MemoryDraft {
  title: string;
  content: string;
  tags: string[];
}

export interface SummariseResult {
  memories: MemoryDraft[];
  /** Focus event at `endMs` that continues a session still open at flush time. */
  carryOver: ActivityEvent | null;
}

const MIN_SESSION_MS = 30_000;
const MAX_TITLES_LISTED = 5;
const MAX_CLIPBOARD_LISTED = 5;

interface Session {
  app: string;
  title: string;
  startMs: number;
  endMs: number;
}

interface AppTotal {
  app: string;
  totalMs: number;
  startMs: number;
  endMs: number;
  titles: Map<string, number>;
}

function buildSessions(
  events: readonly ActivityEvent[],
  endMs: number,
): { sessions: Session[]; carryOver: ActivityEvent | null } {
  const sessions: Session[] = [];
  const state: { open: Omit<Session, "endMs"> | null } = { open: null };

  const close = (at: number): void => {
    if (state.open !== null && at > state.open.startMs) {
      sessions.push({ ...state.open, endMs: at });
    }
    state.open = null;
  };

  for (const event of events) {
    if (event.kind === "focus") {
      // Same app and title: merge into the running session.
      if (state.open?.app === event.app && state.open.title === event.title) {
        continue;
      }
      close(event.at);
      state.open = { app: event.app, title: event.title, startMs: event.at };
    } else if (event.kind === "gap") {
      close(event.at);
    }
  }

  let carryOver: ActivityEvent | null = null;
  if (state.open !== null) {
    const { app, title } = state.open;
    close(endMs);
    carryOver = { kind: "focus", at: endMs, app, title };
  }
  return { sessions, carryOver };
}

function totalByApp(sessions: readonly Session[]): AppTotal[] {
  const totals = new Map<string, AppTotal>();
  for (const session of sessions) {
    const ms = session.endMs - session.startMs;
    const entry = totals.get(session.app) ?? {
      app: session.app,
      totalMs: 0,
      startMs: session.startMs,
      endMs: session.endMs,
      titles: new Map<string, number>(),
    };
    entry.totalMs += ms;
    entry.startMs = Math.min(entry.startMs, session.startMs);
    entry.endMs = Math.max(entry.endMs, session.endMs);
    entry.titles.set(
      session.title,
      (entry.titles.get(session.title) ?? 0) + ms,
    );
    totals.set(session.app, entry);
  }
  return [...totals.values()].sort((a, b) => b.totalMs - a.totalMs);
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(rest)} min`;
}

function utcStamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function utcRange(startMs: number, endMs: number): string {
  const start = utcStamp(startMs);
  const end = utcStamp(endMs);
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  return `${start} to ${sameDay ? end.slice(11) : end} UTC`;
}

/** "search.ts - vmem - Visual Studio Code" in app "Visual Studio Code" -> "search.ts - vmem". */
function stripAppSuffix(title: string, app: string): string {
  const lower = title.toLowerCase();
  for (const sep of [" - ", " — ", " | "]) {
    const suffix = `${sep}${app}`.toLowerCase();
    if (lower.endsWith(suffix))
      return title.slice(0, title.length - suffix.length);
  }
  return title;
}

function appMemory(total: AppTotal): MemoryDraft {
  const ranked = [...total.titles.entries()]
    .map(([title, ms]) => ({ title: stripAppSuffix(title, total.app), ms }))
    .sort((a, b) => b.ms - a.ms);
  const top = ranked[0]?.title ?? "";
  const duration = formatDuration(total.totalMs);
  const heading = top
    ? `Worked in ${total.app} on ${top} for ${duration}`
    : `Worked in ${total.app} for ${duration}`;

  const lines = [
    `Active in ${total.app} between ${utcRange(total.startMs, total.endMs)}.`,
    `Focus time: ${duration} (idle, paused and blocked time excluded).`,
  ];
  const listed = ranked.filter((entry) => entry.title.length > 0);
  if (listed.length > 0) {
    lines.push("Windows:");
    for (const entry of listed.slice(0, MAX_TITLES_LISTED)) {
      lines.push(`- ${entry.title} (${formatDuration(entry.ms)})`);
    }
    if (listed.length > MAX_TITLES_LISTED) {
      lines.push(`- and ${String(listed.length - MAX_TITLES_LISTED)} more`);
    }
  }
  return {
    title: heading,
    content: lines.join("\n"),
    tags: ["desktop", "activity", slug(total.app)],
  };
}

function captureMemory(events: readonly ActivityEvent[]): MemoryDraft | null {
  const clips: string[] = [];
  let shots = 0;
  let startMs = Infinity;
  let endMs = -Infinity;
  for (const event of events) {
    if (event.kind !== "clipboard" && event.kind !== "screenshot") continue;
    startMs = Math.min(startMs, event.at);
    endMs = Math.max(endMs, event.at);
    if (event.kind === "clipboard") clips.push(event.text);
    else shots += 1;
  }
  if (clips.length === 0 && shots === 0) return null;

  const parts: string[] = [];
  if (clips.length > 0) {
    parts.push(
      `${String(clips.length)} clipboard ${clips.length === 1 ? "copy" : "copies"}`,
    );
  }
  if (shots > 0) {
    parts.push(`${String(shots)} screenshot${shots === 1 ? "" : "s"}`);
  }
  const lines = [
    `Desktop capture between ${utcRange(startMs, endMs)}: ${parts.join(" and ")}.`,
  ];
  if (shots > 0) {
    lines.push("Screenshots stay on the device and are not uploaded.");
  }
  if (clips.length > 0) {
    lines.push("Copied text (trimmed):");
    for (const clip of clips.slice(0, MAX_CLIPBOARD_LISTED)) {
      lines.push(`- ${clip}`);
    }
    if (clips.length > MAX_CLIPBOARD_LISTED) {
      lines.push(`- and ${String(clips.length - MAX_CLIPBOARD_LISTED)} more`);
    }
  }
  return {
    title: `Desktop capture: ${parts.join(" and ")}`,
    content: lines.join("\n"),
    tags: ["desktop", "capture"],
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Turns raw events into a few activity memories: one per app (total focus
 * time, top window titles) plus one for optional captures.
 *
 * - Consecutive samples of the same app and title merge.
 * - Idle, paused and blocked gaps split sessions and add no focus time.
 * - Sessions under 30 s are dropped, unless nothing longer exists.
 */
export function summarise(
  events: readonly ActivityEvent[],
  options: { endMs: number; minSessionMs?: number },
): SummariseResult {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const { sessions, carryOver } = buildSessions(sorted, options.endMs);
  const min = options.minSessionMs ?? MIN_SESSION_MS;
  const long = sessions.filter((s) => s.endMs - s.startMs >= min);
  const kept = long.length > 0 ? long : sessions;

  const memories = totalByApp(kept).map(appMemory);
  const captures = captureMemory(sorted);
  if (captures !== null) memories.push(captures);
  return { memories, carryOver };
}
