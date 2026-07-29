"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  createExtractedFactMemory,
  extractFactsFromInstruction,
  requireOpenRouterAuth,
} from "./agent/shared";
import {
  buildV2DeleteReason,
  buildV2UpdateReason,
  reconcileExtractedFacts,
} from "./agent/reconcileFacts";

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

    // resolved rather than defaulted, the capture may target a team profile, and reconciliation has to read the whole shared profile to see teammates' facts
    const graphScope =
      args.profileId === undefined
        ? "personal"
        : await ctx.runQuery(internal.profiles.getProfileScopeInternal, {
            profileId: args.profileId,
          });

    const { applied, proposals } = await reconcileExtractedFacts(ctx, {
      clerkId: args.clerkId,
      profileId: args.profileId,
      auth,
      facts: extracted.facts,
      loop: {
        graphScope,
        retrieveWithProfileId: false,
        excludeMemoryIds: [args.sourceMemoryId],
        logPrefix: "[v2]",
        bestEffortPerFact: true,
      },
      applyLogPrefix: "[v2]",
      createAdd: ({ factIndex, text }) =>
        createExtractedFactMemory(ctx, {
          clerkId: args.clerkId,
          profileId: args.profileId,
          factIndex,
          text,
          variant: "v2",
          externalIdScope: [args.sourceMemoryId],
        }),
      buildUpdateReason: buildV2UpdateReason,
      buildDeleteReason: buildV2DeleteReason,
    });

    if (proposals.length > 0) {
      await ctx.runMutation(internal.notifications.pushForClerkIdInternal, {
        clerkId: args.clerkId,
        title:
          proposals.length === 1
            ? "New memory proposal awaiting review"
            : `${String(proposals.length)} memory proposals awaiting review`,
        description:
          "vmem detected potential conflicts with existing memories. Review and approve or reject in Proposals.",
        type: "info",
      });
    }

    console.log(
      `[v2] Applied ${String(applied.length)} ADDs and ${String(proposals.length)} proposals from ${String(extracted.facts.length)} facts`,
    );
    return {
      extracted: extracted.facts.length,
      applied: applied.length,
      proposals: proposals.length,
    };
  },
});
