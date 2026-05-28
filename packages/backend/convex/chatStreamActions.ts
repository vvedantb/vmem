"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createCloudAgent } from "./agent";
import { requireUserEnvVar } from "./lib/envVars";
import { scheduleLog } from "./lib/openRouter/shared";
import type { CloudMemoryRef } from "../src/cloud/cloudMemoryRef";
import {
  buildCloudChatSystemPrompt,
  type SkillIndexEntry,
} from "../src/memoryRagPrompt";

function addMemoryRefs(
  refsById: Map<string, CloudMemoryRef>,
  refs: CloudMemoryRef[],
): void {
  for (const ref of refs) {
    refsById.set(ref.id, ref);
  }
}

export const streamAsync = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    userId: v.id("users"),
    modelId: v.string(),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const start = performance.now();
    const apiKey = await requireUserEnvVar(
      ctx,
      args.userId,
      "OPENROUTER_API_KEY",
    );

    const skills: SkillIndexEntry[] = await ctx.runAction(
      internal.mcp.skills.mcpListSkills,
      { clerkId: args.clerkId },
    );

    const systemPrompt = buildCloudChatSystemPrompt({ skills });
    const memoryRefsById = new Map<string, CloudMemoryRef>();
    const { buildOpenRouterTools } =
      await import("../src/cloud/openRouterTools");
    const tools = buildOpenRouterTools(ctx, args.clerkId, {
      onMemoryRetrieve: (refs) => addMemoryRefs(memoryRefsById, refs),
    });

    const agent = createCloudAgent({
      apiKey,
      modelId: args.modelId,
      tools,
      instructions: systemPrompt,
    });

    const result = await agent.streamText(
      ctx,
      { threadId: args.threadId, userId: args.userId },
      {
        promptMessageId: args.promptMessageId,
        toolChoice: "auto",
        temperature: 0.5,
      },
      { saveStreamDeltas: true },
    );

    await result.consumeStream();

    const totalUsage = await result.totalUsage;
    const finishReason = await result.finishReason;
    await scheduleLog(ctx, {
      userId: args.userId,
      feature: "chat",
      endpoint: "chat",
      model: args.modelId,
      status: 200,
      ok: true,
      latencyMs: Math.round(performance.now() - start),
      finishReason,
      promptTokens: totalUsage.inputTokens,
      completionTokens: totalUsage.outputTokens,
      totalTokens: totalUsage.totalTokens,
      reasoningTokens: totalUsage.reasoningTokens,
      cachedTokens: totalUsage.inputTokenDetails?.cacheReadTokens,
    });

    const memoryRefs = Array.from(memoryRefsById.values());
    if (memoryRefs.length > 0 && result.order !== undefined) {
      await ctx.runMutation(internal.chat.saveCloudMessageMemoryRefs, {
        userId: args.userId,
        threadId: args.threadId,
        assistantOrder: result.order,
        assistantStepOrder: 0,
        memoryRefs,
      });
    }
  },
});
