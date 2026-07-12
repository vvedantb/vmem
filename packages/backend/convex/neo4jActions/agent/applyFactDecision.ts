"use node";

import type { Driver } from "neo4j-driver";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getMemory } from "../../../engine/neo4j/memory/crud";
import type { ProposedUpdateNode } from "../../../engine/neo4j/memory/types";
import type { UpdateDecision } from "../../prompts/v2Prompt";

export async function applyFactUpdateOrDelete(
  ctx: ActionCtx,
  driver: Driver,
  params: {
    clerkId: string;
    factText: string;
    decision: UpdateDecision;
    buildUpdateReason: (args: {
      factText: string;
      decision: UpdateDecision;
    }) => string;
    buildDeleteReason: (args: {
      factText: string;
      decision: UpdateDecision;
    }) => string;
    logPrefix?: string;
    onProposal?: (proposal: ProposedUpdateNode) => void;
  },
): Promise<"update" | "delete" | "none" | "missing-target"> {
  const {
    clerkId,
    factText,
    decision,
    buildUpdateReason,
    buildDeleteReason,
    logPrefix,
    onProposal,
  } = params;

  if (decision.event === "UPDATE" && decision.id && decision.text) {
    const target = await getMemory(driver, clerkId, decision.id);
    if (!target) {
      if (logPrefix) {
        console.warn(
          `${logPrefix} UPDATE target ${decision.id} not found, skipping`,
        );
      }
      return "missing-target";
    }
    const reason = buildUpdateReason({ factText, decision });
    const proposal = await ctx.runAction(
      internal.neo4jActions.proposedUpdates.createProposedUpdateInternal,
      {
        memoryId: decision.id,
        proposedContent: decision.text,
        reason,
      },
    );
    onProposal?.(proposal);
    return "update";
  }

  if (decision.event === "DELETE" && decision.id) {
    const target = await getMemory(driver, clerkId, decision.id);
    if (!target) {
      if (logPrefix) {
        console.warn(
          `${logPrefix} DELETE target ${decision.id} not found, skipping`,
        );
      }
      return "missing-target";
    }
    const reason = buildDeleteReason({ factText, decision });
    const proposal = await ctx.runAction(
      internal.neo4jActions.proposedUpdates.createProposedDeleteInternal,
      {
        memoryId: decision.id,
        reason,
      },
    );
    onProposal?.(proposal);
    return "delete";
  }

  return "none";
}
