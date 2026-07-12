"use node";

import crypto from "node:crypto";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getDriver } from "../../engine/neo4j/driver";
import { applyFactUpdateOrDelete } from "./agent/applyFactDecision";
import { runFactDecisionLoop } from "./agent/factDecisionLoop";
import {
  extractFactsFromInstruction,
  requireOpenRouterAuth,
} from "./agent/shared";

/**
 * V2 ADD/UPDATE/DELETE/NONE pipeline for prompt-capture.
 *
 * Triggered async (via `ctx.scheduler.runAfter(0, ...)`) from
 * `createMemoryInternal` whenever a memory is saved with `source ===
 * "prompt-capture"`. The user's raw prompt is preserved verbatim as the
 * source memory; this action extracts atomic, durable facts from it and
 * - for each fact - decides whether to ADD a new memory, propose an
 * UPDATE to an existing one, propose a DELETE, or do nothing.
 *
 * The pipeline is best-effort: any failure (no API key, parse error,
 * Neo4j hiccup) silently skips that fact instead of breaking the user's
 * save. Memory creation already returned to the user before we ran.
 *
 * Skips silently when no `OPENROUTER_API_KEY` is configured - vmem
 * always degrades to "save the prompt as-is" without LLM augmentation.
 *
 * Stage A/B LLM helpers are shared with the SDK agent path
 * (`./agent/shared`); this module keeps prompt-capture-specific
 * retrieve filtering, metadata, and notification batching.
 */

/** Stable per-fact externalId so re-running on the same prompt is idempotent. */
function computeFactExternalId(
  sourceMemoryId: string,
  factIndex: number,
  factText: string,
): string {
  const h = crypto.createHash("sha256");
  h.update(sourceMemoryId);
  h.update("\0");
  h.update(String(factIndex));
  h.update("\0");
  h.update(factText);
  return h.digest("hex");
}

export const extractFactsAndDecideInternal = internalAction({
  args: {
    clerkId: v.string(),
    sourceMemoryId: v.string(),
    capturedPrompt: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Silent skip: no key configured. Save flow already completed; the
    // user's original prompt is preserved as a memory regardless.
    const auth = await requireOpenRouterAuth(ctx, args.clerkId);
    if ("error" in auth) {
      console.log("[v2] No OPENROUTER_API_KEY - skipping fact extraction");
      return { extracted: 0, applied: 0 };
    }

    // Stage A: extract atomic facts
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

    // Stage B: per-fact decision (sequential to avoid OpenRouter rate limits)
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
          const externalId = computeFactExternalId(
            args.sourceMemoryId,
            factIndex,
            decision.text,
          );
          await ctx.runAction(
            internal.neo4jActions.memories.createMemoryInternal,
            {
              clerkId: args.clerkId,
              profileId: args.profileId,
              title: decision.text.slice(0, 80),
              content: decision.text,
              type: "knowledge",
              source: "v2-extracted",
              tags: ["v2-extracted"],
              confidence: 0.9,
              externalId,
              sourceType: "v2-extracted",
            },
          );
          appliedCount += 1;
        } else {
          const outcome = await applyFactUpdateOrDelete(ctx, driver, {
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
