"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createCloudAgent } from "./agent";
import { requireUserEnvVar } from "./lib/envVars";
import { scheduleLog } from "./lib/openRouter/shared";
import type { CloudMemoryRef } from "./cloudLib/cloudMemoryRef";
import { buildOpenRouterTools } from "./cloudLib/openRouterTools";
import { buildCloudChatSystemPrompt, type SkillIndexEntry } from "@vmem/shared";
import { toSkillIndexEntry } from "./skills";

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
    /** The thread's workspace — memory tools are pinned to it. */
    profileId: v.optional(v.string()),
    /** Set when the workspace is a team profile (team scope + team skills). */
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    const start = performance.now();
    const apiKey = await requireUserEnvVar(
      ctx,
      args.userId,
      "OPENROUTER_API_KEY",
    );

    // Skills index: the user's effective skills (personal + installed system
    // skills — listEffectiveByClerkIdInternal resolves both); team workspaces
    // additionally see the team's skills (merged).
    const personalSkills: SkillIndexEntry[] = (
      await ctx.runQuery(internal.skills.listEffectiveByClerkIdInternal, {
        clerkId: args.clerkId,
      })
    ).map(toSkillIndexEntry);
    let skills: SkillIndexEntry[] = personalSkills;
    if (args.teamId !== undefined) {
      const teamSkills = await ctx.runQuery(
        internal.skills.listTeamSkillsInternal,
        { teamId: args.teamId },
      );
      skills = [...personalSkills, ...teamSkills.map(toSkillIndexEntry)];
    }

    const systemPrompt = buildCloudChatSystemPrompt({ skills });
    const memoryRefsById = new Map<string, CloudMemoryRef>();
    const tools = buildOpenRouterTools(ctx, args.clerkId, {
      onMemoryRetrieve: (refs) => addMemoryRefs(memoryRefsById, refs),
      profileId: args.profileId,
      scope: args.teamId !== undefined ? "team" : "personal",
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
