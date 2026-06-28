/**
 * No-memory baseline — "Claude without vmem".
 *
 * Ingestion is a no-op; search returns empty context. The answer model must
 * rely on parametric knowledge only (same as a memory-disconnected chat).
 * Compare against `vmem` (retrieval) and `full-context` (oracle ceiling).
 */

import { type MemoryProvider, type BenchSearchOutcome } from "./types";
import type { LocomoSession } from "../datasets/locomo";

export class NoMemoryProvider implements MemoryProvider {
  readonly name = "no-memory";

  reset(_conversationId: string): Promise<void> {
    return Promise.resolve();
  }

  ingestSession(
    _conversationId: string,
    _session: LocomoSession,
  ): Promise<void> {
    return Promise.resolve();
  }

  search(
    _conversationId: string,
    _query: string,
    _k: number,
  ): Promise<BenchSearchOutcome> {
    return Promise.resolve({
      results: [],
      latencyMs: 0,
      contextTokens: 0,
    });
  }
}
