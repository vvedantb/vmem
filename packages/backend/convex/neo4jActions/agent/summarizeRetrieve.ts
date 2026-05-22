"use node";

import type { ActionCtx } from "../../_generated/server";
import {
  buildRetrieveSummaryPrompt,
  parseRetrieveSummaryResponse,
} from "../../../src/sdkPrompt";
import {
  requireOpenRouterAuth,
  callAgentLLM,
  type OpenRouterRequired,
} from "./shared";

export interface SummarizeRetrieveMemoryInput {
  id: string;
  title: string;
  content: string;
}

export interface SummarizeRetrieveArgs {
  clerkId: string;
  query: string;
  memories: SummarizeRetrieveMemoryInput[];
  profileId?: string;
}

export interface SummarizeRetrieveResult {
  summary: string;
}

export async function runSummarizeRetrieve(
  ctx: ActionCtx,
  args: SummarizeRetrieveArgs,
): Promise<SummarizeRetrieveResult | OpenRouterRequired> {
  const auth = await requireOpenRouterAuth(ctx, args.clerkId);
  if ("error" in auth) {
    return auth;
  }

  const prompt = buildRetrieveSummaryPrompt(args.query, args.memories);
  const raw = await callAgentLLM(
    ctx,
    auth,
    args.profileId,
    "memory-search",
    prompt,
  );

  const summary = raw ? parseRetrieveSummaryResponse(raw) : null;

  return {
    summary:
      summary ??
      (args.memories.length === 0
        ? "No relevant memories found."
        : "Retrieved memories are available but could not be summarized."),
  };
}
