import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { activityEventSchema, type ActivityEvent } from "./events";
import { summarise, type MemoryDraft } from "./summarise";

const MAX_STORED_EVENTS = 10_000;
const eventsFileSchema = z.array(activityEventSchema);

/** Local event batch: one JSON file in the Electron userData directory. */
export class BatchStore {
  private readonly file: string;
  private events: ActivityEvent[];

  constructor(
    private readonly dir: string,
    private readonly maxEvents: number = MAX_STORED_EVENTS,
  ) {
    this.file = join(dir, "events.json");
    this.events = this.load();
  }

  append(event: ActivityEvent): void {
    this.events.push(event);
    this.save();
  }

  snapshot(): ActivityEvent[] {
    return [...this.events];
  }

  last(): ActivityEvent | undefined {
    return this.events.at(-1);
  }

  /** Drops the first `count` events (already posted) and re-queues `carry`. */
  commit(count: number, carry: ActivityEvent | null): void {
    this.events = this.events.slice(count);
    if (carry !== null) this.events.unshift(carry);
    this.save();
  }

  private load(): ActivityEvent[] {
    try {
      return eventsFileSchema.parse(
        JSON.parse(readFileSync(this.file, "utf8")),
      );
    } catch {
      return [];
    }
  }

  private save(): void {
    // Keep the newest events if the backlog grows (for example, no API key).
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.events));
  }
}

/**
 * Summarises the stored events and posts one memory per draft. If a post
 * throws, the events stay in the store and the next flush retries; drafts
 * already sent in that run may be sent again.
 */
export async function flushBatch(
  store: BatchStore,
  post: (draft: MemoryDraft) => Promise<void>,
  now: number,
): Promise<{ posted: number }> {
  const snapshot = store.snapshot();
  if (snapshot.length === 0) return { posted: 0 };
  const { memories, carryOver } = summarise(snapshot, { endMs: now });
  for (const memory of memories) await post(memory);
  store.commit(snapshot.length, carryOver);
  return { posted: memories.length };
}
