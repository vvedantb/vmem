import {
  evaluateSystemOne,
  readSystemOneApiKey,
  SYSTEMONE_DEFAULT_MODEL,
  type EvaluateSystemOneArgs,
  type SystemOneResponse,
} from "../../engine/llm/systemOneClient";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { scheduleLog } from "./openRouter/shared";

const ERROR_CHARS = 200;

/** Deployment `process.env` only (`AI_GATEWAY_API_KEY`). */
export function resolveSystemOneApiKey(): string | undefined {
  return readSystemOneApiKey();
}

type JevLogCtx = Pick<ActionCtx, "runQuery" | "scheduler">;

export type JevLogScope = { clerkId?: string; profileId?: string };

type JevLogRow = {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  errorMessage?: string;
};

/**
 * evaluateSystemOne plus one openRouterLogs row (feature "jev") per call, ok
 * or failed. The engine callers stay pure: they take this as `evaluate`.
 */
export function loggedJevEvaluate(
  ctx: JevLogCtx,
  scope: JevLogScope,
): (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse> {
  return async (args) => {
    try {
      const response = await evaluateSystemOne(args);
      const input = response.usage?.input_tokens;
      const output = response.usage?.output_tokens;
      await logJevCall(ctx, scope, {
        model: response.model,
        promptTokens: input,
        completionTokens: output,
        ...(input === undefined || output === undefined
          ? {}
          : { totalTokens: input + output }),
        costUsd: response.costUsd,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "jev failed";
      await logJevCall(ctx, scope, {
        model: args.model ?? SYSTEMONE_DEFAULT_MODEL,
        errorMessage: message.slice(0, ERROR_CHARS),
      });
      throw error;
    }
  };
}

// best effort: a log failure never changes the Jev result
async function logJevCall(
  ctx: JevLogCtx,
  scope: JevLogScope,
  row: JevLogRow,
): Promise<void> {
  if (scope.clerkId === undefined) return;
  try {
    const userId = await ctx.runQuery(
      internal.auth.getUserIdByClerkIdInternal,
      { clerkId: scope.clerkId },
    );
    if (userId === null) return;
    await scheduleLog(ctx, {
      userId,
      profileId: scope.profileId,
      feature: "jev",
      endpoint: "chat",
      ...row,
    });
  } catch (error) {
    console.error("[jev] failed to log call", error);
  }
}
