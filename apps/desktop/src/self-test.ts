import { getActiveWindow } from "./active-window";
import { flushBatch, type BatchStore } from "./batch";
import type { MemoryDraft } from "./summarise";
import type { Tracker } from "./tracker";

const PACKAGED_TICKS = 12;
const PACKAGED_TICK_MS = 500;

/** Tracker failures seen during a self test. Any entry fails the run. */
export type TrackerFailures = readonly string[];

/**
 * Smoke test: proves the packaged app can load `get-windows` and call it.
 * A headless display may give no window; a throw from import or call fails.
 */
export async function runSmoke(
  tracker: Tracker,
  failures: TrackerFailures,
): Promise<void> {
  await getActiveWindow();
  await tracker.tick();
  const [failure] = failures;
  if (failure !== undefined) throw new Error(failure);
}

/**
 * Packaged test: ticks the tracker until a real focus event exists, then
 * summarises and posts it. Throws unless a focus event and a post happened.
 * The caller reads `events.json` in userData for the recorded events.
 */
export async function runPackagedTest(
  tracker: Tracker,
  batch: BatchStore,
  post: (draft: MemoryDraft) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < PACKAGED_TICKS; i++) {
    await tracker.tick();
    await new Promise((resolve) => setTimeout(resolve, PACKAGED_TICK_MS));
  }
  // Tick once more so the session has a non-zero length at flush time.
  await tracker.tick();
  const focus = batch.snapshot().filter((event) => event.kind === "focus");
  if (focus.length === 0) {
    throw new Error("No focus event recorded (only gaps).");
  }
  const { posted } = await flushBatch(batch, post, Date.now());
  if (posted === 0) throw new Error("No memory was posted.");
}
