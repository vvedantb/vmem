/**
 * Full-context baseline — no memory system.
 *
 * "Ingestion" just accumulates the raw session transcripts in process; at
 * search time it hands the ENTIRE conversation to the answer model. This is
 * the standard anchor in every memory paper: it sets the accuracy ceiling a
 * memory system tries to approach while using a fraction of the tokens (its
 * contextTokens column shows the cost the memory systems avoid).
 */

import {
  approxTokens,
  type MemoryProvider,
  type BenchSearchOutcome,
} from "./types";
import { renderSessionTranscript } from "./vmemExtractPrompt";
import type { LocomoSession } from "../datasets/locomo";

export class FullContextProvider implements MemoryProvider {
  readonly name = "full-context";

  /** conversationId → ordered session blocks. */
  private readonly store = new Map<string, string[]>();

  reset(conversationId: string): Promise<void> {
    this.store.delete(conversationId);
    return Promise.resolve();
  }

  ingestSession(conversationId: string, session: LocomoSession): Promise<void> {
    const block = `## ${session.key} (${session.dateTime || "no date"})\n${renderSessionTranscript(session.turns)}`;
    const existing = this.store.get(conversationId) ?? [];
    existing.push(block);
    this.store.set(conversationId, existing);
    return Promise.resolve();
  }

  search(
    conversationId: string,
    _query: string,
    _k: number,
  ): Promise<BenchSearchOutcome> {
    const blocks = this.store.get(conversationId) ?? [];
    const text = blocks.join("\n\n");
    return Promise.resolve({
      results: text.length > 0 ? [{ id: "full-context", text }] : [],
      latencyMs: 0,
      contextTokens: approxTokens(text),
    });
  }
}
