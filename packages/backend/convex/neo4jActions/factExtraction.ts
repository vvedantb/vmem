"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getDriver } from "../../engine/neo4j/driver";
import { applyFactUpdateOrDelete } from "./agent/applyFactDecision";
import { runFactDecisionLoop } from "./agent/factDecisionLoop";
import {
  createExtractedFactMemory,
  extractFactsFromInstruction,
  requireOpenRouterAuth,
} from "./agent/shared";

export const extractFactsAndDecideInternal = internalAction({
  args: {
    clerkId: v.string(),
    sourceMemoryId: v.string(),
    capturedPrompt: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOpenRouterAuth(ctx, args.clerkId);
    if ("error" in auth) {
      console.log("[v2] No OPENROUTER_API_KEY - skipping fact extraction");
      return { extracted: 0, applied: 0 };
    }

    const extracted = await extractFactsFromInstruction(
      ctx,
      auth,
      args.capturedPrompt,
      args.profileId,
    );
    if (!extracted || extracted.facts.length === 0) {
      console.log("[v2] No durable facts extracted");
      return { extracted: 0, applied: 0 };
    }

    const driver = getDriver();
    let appliedCount = 0;
    let proposalCount = 0;

    await runFactDecisionLoop(
      {
        ctx,
        auth,
        clerkId: args.clerkId,
        profileId: args.profileId,
        retrieveWithProfileId: false,
        excludeMemoryIds: [args.sourceMemoryId],
        logPrefix: "[v2]",
        bestEffortPerFact: true,
      },
      extracted.facts,
      async ({ factIndex, factText, decision }) => {
        if (decision.event === "ADD" && decision.text) {
          await createExtractedFactMemory(ctx, {
            clerkId: args.clerkId,
            profileId: args.profileId,
            factIndex,
            text: decision.text,
            variant: "v2",
            externalIdScope: [args.sourceMemoryId],
          });
          appliedCount += 1;
        } else {
          const outcome = await applyFactUpdateOrDelete(driver, {
            clerkId: args.clerkId,
            factText,
            decision,
            logPrefix: "[v2]",
            buildUpdateReason: ({ factText: ft, decision: d }) =>
              `New fact: "${ft}"` +
              (d.oldMemory ? `\nOld memory: "${d.oldMemory}"` : ""),
            buildDeleteReason: ({ factText: ft }) =>
              `New fact contradicts: "${ft}"`,
          });
          if (outcome === "update" || outcome === "delete") {
            proposalCount += 1;
          }
        }
      },
    );

    if (proposalCount > 0) {
      await ctx.runMutation(internal.notifications.pushForClerkIdInternal, {
        clerkId: args.clerkId,
        title:
          proposalCount === 1
            ? "New memory proposal awaiting review"
            : `${String(proposalCount)} memory proposals awaiting review`,
        description:
          "vmem detected potential conflicts with existing memories. Review and approve or reject in Proposals.",
        type: "info",
      });
    }

    console.log(
      `[v2] Applied ${String(appliedCount)} ADDs and ${String(proposalCount)} proposals from ${String(extracted.facts.length)} facts`,
    );
    return {
      extracted: extracted.facts.length,
      applied: appliedCount,
      proposals: proposalCount,
    };
  },
});
