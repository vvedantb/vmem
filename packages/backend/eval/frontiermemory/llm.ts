import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ZodType, ZodTypeDef } from "zod";
import {
  generateGatewayText,
  type GatewayTextCall,
  type GatewayTextResult,
} from "../../engine/llm/aiGateway.ts";
import { parseJsonString } from "../../engine/llm/extractJsonString.ts";
import { approxTokens } from "./text.ts";

/** Injectable so tests never touch the network. */
export type LlmClient = (call: GatewayTextCall) => Promise<GatewayTextResult>;

/** Real client. The key is read here, at call time, never earlier. */
export const gatewayLlmClient: LlmClient = (call) => {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Promise.reject(new Error("AI_GATEWAY_API_KEY is not set"));
  }
  return generateGatewayText(call);
};

export interface Prices {
  inputUsdPerM: number;
  outputUsdPerM: number;
}

/**
 * Assumed flash-tier list prices ($/M tokens). Not verified for any model:
 * pass `--price-in` / `--price-out` for real numbers. Live runs use the
 * Gateway-reported cost when it is present.
 */
export const DEFAULT_PRICES: Prices = { inputUsdPerM: 0.1, outputUsdPerM: 0.4 };

export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  prices: Prices,
): number {
  return (
    (promptTokens * prices.inputUsdPerM +
      completionTokens * prices.outputUsdPerM) /
    1_000_000
  );
}

export interface LlmUsage {
  calls: number;
  cachedCalls: number;
  failedCalls: number;
  /** Calls not made because they would pass the budget. */
  skippedCalls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  /** Calls priced from token counts because the Gateway gave no cost. */
  estimatedCostCalls: number;
}

/** One sent call, for the per-call log in the work dir. */
interface CallRecord {
  label: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  costSource: "gateway" | "estimate";
  error?: string;
}

export interface Budget {
  limitUsd: number;
  prices: Prices;
  /** Worst-case cost of calls in flight. */
  reservedUsd: number;
  usage: LlmUsage;
  records: CallRecord[];
}

export function createBudget(limitUsd: number, prices: Prices): Budget {
  return {
    limitUsd,
    prices,
    reservedUsd: 0,
    usage: {
      calls: 0,
      cachedCalls: 0,
      failedCalls: 0,
      skippedCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      estimatedCostCalls: 0,
    },
    records: [],
  };
}

/**
 * One budgeted call. Returns the text, or null when the call would pass the
 * hard cap (no request is sent) or when it fails. Failed calls keep their
 * reserved estimate as spend so the cap stays conservative.
 */
export async function callWithBudget(
  budget: Budget,
  client: LlmClient,
  call: GatewayTextCall,
  expectedOutputTokens: number,
  label: string,
): Promise<string | null> {
  const promptChars = call.messages.reduce(
    (sum, message) => sum + message.content.length,
    0,
  );
  const estimatedPrompt = approxTokens(promptChars);
  const estimate = estimateCostUsd(
    estimatedPrompt,
    expectedOutputTokens,
    budget.prices,
  );
  if (budget.usage.costUsd + budget.reservedUsd + estimate > budget.limitUsd) {
    budget.usage.skippedCalls += 1;
    return null;
  }
  budget.reservedUsd += estimate;
  try {
    const result = await client(call);
    const promptTokens = result.promptTokens ?? estimatedPrompt;
    const completionTokens =
      result.completionTokens ?? approxTokens(result.text.length);
    budget.usage.calls += 1;
    budget.usage.promptTokens += promptTokens;
    budget.usage.completionTokens += completionTokens;
    if (result.costUsd === undefined) budget.usage.estimatedCostCalls += 1;
    const costUsd =
      result.costUsd ??
      estimateCostUsd(promptTokens, completionTokens, budget.prices);
    budget.usage.costUsd += costUsd;
    budget.records.push({
      label,
      model: call.model,
      promptTokens,
      completionTokens,
      costUsd,
      costSource: result.costUsd === undefined ? "estimate" : "gateway",
    });
    return result.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    budget.usage.failedCalls += 1;
    budget.usage.costUsd += estimate;
    budget.records.push({
      label,
      model: call.model,
      promptTokens: estimatedPrompt,
      completionTokens: 0,
      costUsd: estimate,
      costSource: "estimate",
      error: message,
    });
    console.warn(`LLM call ${label} failed: ${message}`);
    return null;
  } finally {
    budget.reservedUsd -= estimate;
  }
}

/** JSON file cache under the work dir. Bad or stale entries read as null. */
export function readCache<T>(
  dir: string,
  key: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
): T | null {
  try {
    return parseJsonString(
      readFileSync(path.join(dir, `${key}.json`), "utf8"),
      schema,
    );
  } catch {
    return null;
  }
}

export function writeCache(dir: string, key: string, value: object): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${key}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

/** Runs `worker` over `items` with at most `limit` in flight, keeping order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await worker(item, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane),
  );
  return results;
}
