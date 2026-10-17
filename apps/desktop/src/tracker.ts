import { isBlocked, sanitiseTitle, type ActiveWindow } from "./blocklist";
import type { ActivityEvent } from "./events";
import type { Settings } from "./settings-schema";

type GapReason = Extract<ActivityEvent, { kind: "gap" }>["reason"];

export interface TrackerDeps {
  getActiveWindow: () => Promise<ActiveWindow | null>;
  /** Seconds since the last keyboard or mouse input. Idle time only, no key data. */
  getIdleSeconds: () => number;
  getSettings: () => Settings;
  record: (event: ActivityEvent) => void;
  /** Receives native window API failures, at most once per `ERROR_LOG_INTERVAL_MS`. */
  logError?: (message: string) => void;
  now?: () => number;
}

const ERROR_LOG_INTERVAL_MS = 30_000;

/** Polls the active window and records an event only when the state changes. */
export class Tracker {
  private state = "";
  private lastAt = 0;
  private active: ActiveWindow | null = null;
  private lastErrorLogAt: number | null = null;

  constructor(private readonly deps: TrackerDeps) {}

  /** Last recorded, non-blocked window. Null while idle, paused or blocked. */
  activeWindow(): ActiveWindow | null {
    return this.active;
  }

  async tick(): Promise<void> {
    const settings = this.deps.getSettings();
    const now = (this.deps.now ?? Date.now)();

    if (settings.paused) {
      this.gap("paused", now);
      return;
    }

    const idleMs = this.deps.getIdleSeconds() * 1000;
    if (idleMs >= settings.idleThresholdMinutes * 60_000) {
      // Idle began when input stopped, not when the threshold passed.
      this.gap("idle", Math.max(this.lastAt, now - idleMs));
      return;
    }

    let window: ActiveWindow | null = null;
    try {
      window = await this.deps.getActiveWindow();
    } catch (error) {
      // Native window APIs can fail. Log it, then split the session below.
      this.logError(
        error instanceof Error ? error.message : String(error),
        now,
      );
    }
    if (window === null) {
      this.gap("unknown", now);
      return;
    }
    if (isBlocked(window, settings.blocklist)) {
      this.gap("blocked", now);
      return;
    }

    const app = window.app.trim();
    const title = sanitiseTitle(window.title);
    const key = `focus\u0000${app}\u0000${title}`;
    if (key === this.state) return;
    this.state = key;
    this.lastAt = now;
    this.active = { app, title };
    this.deps.record({ kind: "focus", at: now, app, title });
  }

  /** Ends the open session, for example before quit. */
  stop(): void {
    this.gap("shutdown", (this.deps.now ?? Date.now)());
  }

  private logError(reason: string, now: number): void {
    const last = this.lastErrorLogAt;
    if (last !== null && now - last < ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLogAt = now;
    this.deps.logError?.(`active window failed: ${reason}`);
  }

  private gap(reason: GapReason, at: number): void {
    const key = `gap\u0000${reason}`;
    this.active = null;
    if (key === this.state) return;
    this.state = key;
    this.lastAt = at;
    this.deps.record({ kind: "gap", at, reason });
  }
}
