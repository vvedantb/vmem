"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getMemory } from "../../../engine/neo4j/memory/crud";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import { getDriver } from "../../../engine/neo4j/driver";
import { runCreateMemory } from "../_memories/create";
import { resolveProfileIdForClerkId } from "../_memories/shared";
import { runFactDecisionLoop } from "./factDecisionLoop";
import {
  extractFactsFromInstruction,
  computeSdkFactExternalId,
  requireOpenRouterAuth,
  type OpenRouterRequired,
} from "./shared";

export interface AgentProposal {
  id: string;
  memoryId: string;
  proposedContent: string;
  reason: string;
  kind: string;
  status: string;
}

export interface UpdateFromInstructionResult {
  applied: MemoryWithTags[];
  proposals: AgentProposal[];
  summary: string;
}

export interface UpdateFromInstructionArgs {
  clerkId: string;
  instruction: string;
  profileId?: string;
}

export async function runUpdateFromInstruction(
  ctx: ActionCtx,
  args: UpdateFromInstructionArgs,
): Promise<UpdateFromInstructionResult | OpenRouterRequired> {
  const auth = await requireOpenRouterAuth(ctx, args.clerkId);
  if ("error" in auth) {
    return auth;
  }

  const profileId = await resolveProfileIdForClerkId(
    ctx,
    args.clerkId,
    args.profileId,
  );

  const extracted = await extractFactsFromInstruction(
    ctx,
    auth,
    args.instruction,
    profileId,
  );

  if (!extracted || extracted.facts.length === 0) {
    return {
      applied: [],
      proposals: [],
      summary: "No durable facts found to reconcile against existing memories.",
    };
  }

  const driver = getDriver();
  const applied: MemoryWithTags[] = [];
  const proposals: AgentProposal[] = [];

  await runFactDecisionLoop(
    {
      ctx,
      auth,
      clerkId: args.clerkId,
      profileId,
      retrieveWithProfileId: true,
      logPrefix: "[agent]",
    },
    extracted.facts,
    async ({ factIndex: index, factText, decision }) => {
      if (decision.event === "ADD" && decision.text) {
        const memory = await runCreateMemory(ctx, {
          clerkId: args.clerkId,
          profileId,
          title: decision.text.slice(0, 80),
          content: decision.text,
          type: "knowledge",
          source: "sdk-api",
          tags: ["sdk-extracted"],
          confidence: 0.9,
          externalId: computeSdkFactExternalId(
            args.clerkId,
            args.instruction,
            index,
            decision.text,
          ),
          sourceType: "sdk-extracted",
        });
        applied.push(memory);
        return;
      }

      if (decision.event === "UPDATE" && decision.id && decision.text) {
        const target = await getMemory(driver, args.clerkId, decision.id);
        if (!target) {
          return;
        }
        const reason =
          `Instruction: "${args.instruction}"` +
          `\nNew fact: "${factText}"` +
          (decision.oldMemory ? `\nOld memory: "${decision.oldMemory}"` : "");
        const proposal = await ctx.runAction(
          internal.neo4jActions.proposedUpdates.createProposedUpdateInternal,
          {
            memoryId: decision.id,
            proposedContent: decision.text,
            reason,
          },
        );
        proposals.push({
          id: proposal.id,
          memoryId: proposal.memoryId,
          proposedContent: proposal.proposedContent,
          reason: proposal.reason,
          kind: proposal.kind,
          status: proposal.status,
        });
        return;
      }

      if (decision.event === "DELETE" && decision.id) {
        const target = await getMemory(driver, args.clerkId, decision.id);
        if (!target) {
          return;
        }
        const reason = `Instruction: "${args.instruction}" contradicts: "${factText}"`;
        const proposal = await ctx.runAction(
          internal.neo4jActions.proposedUpdates.createProposedDeleteInternal,
          {
            memoryId: decision.id,
            reason,
          },
        );
        proposals.push({
          id: proposal.id,
          memoryId: proposal.memoryId,
          proposedContent: proposal.proposedContent,
          reason: proposal.reason,
          kind: proposal.kind,
          status: proposal.status,
        });
      }
    },
  );

  return {
    applied,
    proposals,
    summary: `Applied ${String(applied.length)} ${applied.length === 1 ? "memory" : "memories"} and created ${String(proposals.length)} ${proposals.length === 1 ? "proposal" : "proposals"}.`,
  };
}
