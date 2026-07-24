import type { FunctionArgs } from "convex/server";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { OpenRouterFeature } from "./schemas";

export type { OpenRouterFeature };

export const LLM_MODEL = "qwen/qwen3-235b-a22b-2507";

export const PROMPT_PREVIEW_BYTES = 4096;
export const COMPLETION_PREVIEW_BYTES = 2048;

type LogPayload = FunctionArgs<typeof internal.openRouterLogs.recordInternal>;

export async function scheduleLog(
  ctx: ActionCtx,
  payload: LogPayload,
): Promise<void> {
  try {
    await ctx.scheduler.runAfter(
      0,
      internal.openRouterLogs.recordInternal,
      payload,
    );
  } catch (e) {
    console.error("[openRouter] failed to schedule log row", e);
  }
}

export function previewsEnabled(): boolean {
  return process.env.OPENROUTER_LOG_PROMPTS === "1";
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}
