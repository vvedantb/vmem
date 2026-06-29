/**
 * CLI OpenRouter chat client for the benchmark harness.
 *
 * Mirrors the production `callOpenRouterChat` / `callJsonChat` shape
 * (`convex/lib/openRouter/chat.ts`, `jsonChat.ts`) but standalone — no
 * Convex ActionCtx, no DB logging. Adds cumulative token/cost accounting
 * and a hard call cap so a runaway run can't quietly burn budget.
 *
 * `usage.cost` from OpenRouter is authoritative USD spend; we sum it.
 */

import {
  createOpenRouterClient,
  readOpenRouterError,
} from "../../convex/lib/openRouter/client";

/** Matches the production JSON-mode system instruction in jsonChat.ts. */
const JSON_SYSTEM_INSTRUCTION =
  "Respond with ONLY valid JSON. No thinking, no markdown, no commentary.";

const MAX_ATTEMPTS = 5;
// Generic transient backoff (network / 5xx).
const RETRY_BASE_MS = 800;
// Rate-limit (429) backoff. Free-tier windows are ~per-minute, so short waits
// never clear them — back off in multi-second steps instead.
const RATE_LIMIT_BASE_MS = 6000;

export class CallCapExceededError extends Error {
  constructor(public readonly cap: number) {
    super(`LLM call cap reached (${String(cap)} calls). Run aborted.`);
    this.name = "CallCapExceededError";
  }
}

/**
 * Shared call cap across every model client in a run (memory + answer +
 * judge). One Budget instance is passed to all `createBenchLlm` calls so the
 * cap bounds total spend, not per-client spend.
 */
export class CallBudget {
  private count = 0;
  /** @param cap maximum total calls; 0 means unlimited. */
  constructor(private readonly cap: number) {}
  record(): void {
    this.count += 1;
    if (this.cap > 0 && this.count > this.cap) {
      throw new CallCapExceededError(this.cap);
    }
  }
  get used(): number {
    return this.count;
  }
}

export interface BenchLlmTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface BenchLlm {
  /** One JSON-mode completion. Returns raw content (or null on failure). */
  chatJson(prompt: string, role?: string): Promise<string | null>;
  /** One free-text completion (used by the answer model). */
  chatText(prompt: string, role?: string): Promise<string | null>;
  readonly totals: BenchLlmTotals;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export interface BenchLlmConfig {
  apiKey: string;
  model: string;
  /** Shared cross-client cap. Omit for an unbounded client. */
  budget?: CallBudget;
  /**
   * Sampling temperature. Left undefined by default and OMITTED from the
   * request — the gpt-5 family (gpt-5-nano/mini) rejects any non-default
   * temperature, so we never send one unless explicitly asked.
   */
  temperature?: number;
}

export function createBenchLlm(config: BenchLlmConfig): BenchLlm {
  const client = createOpenRouterClient(config.apiKey);
  const totals: BenchLlmTotals = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
  };

  async function send(
    system: string,
    prompt: string,
    jsonMode: boolean,
  ): Promise<string | null> {
    if (config.budget) config.budget.record();
    totals.calls += 1;

    let lastError = "unknown error";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const json = await client.chat.send({
          chatRequest: {
            model: config.model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            ...(config.temperature === undefined
              ? {}
              : { temperature: config.temperature }),
            // Force valid JSON for JSON-mode calls (extraction/decision/
            // enrichment). Without this, models (incl. gpt-4o-mini) intermittently
            // emit malformed JSON for the structured prompts and the response is
            // dropped — silently losing facts. The system prompt already contains
            // "JSON", which json_object mode requires.
            ...(jsonMode ? { responseFormat: { type: "json_object" } } : {}),
            stream: false,
          },
        });

        const usage = json.usage;
        if (usage) {
          totals.promptTokens += usage.promptTokens ?? 0;
          totals.completionTokens += usage.completionTokens ?? 0;
          totals.costUsd += usage.cost ?? 0;
        }

        const content = json.choices[0]?.message?.content;
        return typeof content === "string" ? content : null;
      } catch (err) {
        const { status, message } = readOpenRouterError(err);
        lastError = `${String(status)}: ${message}`;
        if (attempt < MAX_ATTEMPTS && (status === 0 || isRetryable(status))) {
          const base = status === 429 ? RATE_LIMIT_BASE_MS : RETRY_BASE_MS;
          await sleep(base * attempt);
          continue;
        }
        console.warn(`[bench-llm] call failed (${lastError})`);
        return null;
      }
    }
    console.warn(`[bench-llm] exhausted retries (${lastError})`);
    return null;
  }

  return {
    totals,
    chatJson(prompt, role) {
      const system = role
        ? `${role} ${JSON_SYSTEM_INSTRUCTION}`
        : JSON_SYSTEM_INSTRUCTION;
      return send(system, prompt, true);
    },
    chatText(prompt, role) {
      return send(role ?? "You are a helpful assistant.", prompt, false);
    },
  };
}
