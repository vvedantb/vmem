/**
 * Provider abstraction for the benchmark harness.
 *
 * A MemoryProvider is one row in the results table: vmem (the system under
 * test), Mem0, Supermemory, or the full-context baseline. The harness drives
 * every provider through the SAME ingest → search → answer → judge loop so
 * the only variable between rows is the memory system itself.
 */

import type { LocomoSession } from "../datasets/locomo";

export interface BenchSearchResult {
  id: string;
  /** Memory text the answer model sees. */
  text: string;
  /** Provider-native relevance score, when available. */
  score?: number;
}

export interface BenchSearchOutcome {
  results: BenchSearchResult[];
  /** Wall-clock for the search/retrieval call only. */
  latencyMs: number;
  /** Approximate tokens in the concatenated result text (chars/4). */
  contextTokens: number;
}

export interface MemoryProvider {
  /** Stable provider key used in result rows and the report ("vmem", "mem0"…). */
  readonly name: string;

  /**
   * Whether ingested state survives a process restart, so a persisted "ingested"
   * marker can be trusted to skip re-ingest on `--resume`. True for stores backed
   * by a database (vmem→Neo4j). FALSE for providers that hold ingest state only in
   * process memory (full-context): on resume their store is empty, so they MUST
   * re-ingest or search would return nothing (a blind oracle). No-memory has no
   * ingest state to lose, so the marker is safe to trust.
   */
  readonly persistsIngest: boolean;

  /** Remove all prior state for one conversation namespace (idempotent). */
  reset(conversationId: string): Promise<void>;

  /** Ingest one chronological session into the conversation's memory store. */
  ingestSession(
    conversationId: string,
    session: LocomoSession,
    speakerA: string,
    speakerB: string,
  ): Promise<void>;

  /** Retrieve the top-k memories for a question. */
  search(
    conversationId: string,
    query: string,
    k: number,
  ): Promise<BenchSearchOutcome>;

  /** Optional teardown (close clients, etc.) after the whole run. */
  cleanup?(): Promise<void>;
}

/** chars/4 token approximation — matches the codebase's chunking heuristic. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
