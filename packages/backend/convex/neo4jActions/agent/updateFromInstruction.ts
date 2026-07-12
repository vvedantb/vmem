"use node";

import type { ActionCtx } from "../../_generated/server";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import { getDriver } from "../../../engine/neo4j/driver";
import { resolveProfileIdForClerkId } from "../_memories/shared";
import { applyFactUpdateOrDelete } from "./applyFactDecision";
import { runFactDecisionLoop } from "./factDecisionLoop";
import {
  extractFactsFromInstruction,
  createSdkExtractedMemory,
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
        const memory = await createSdkExtractedMemory(ctx, {
          clerkId: args.clerkId,
          profileId,
          instruction: args.instruction,
          factIndex: index,
          text: decision.text,
        });
        applied.push(memory);
        return;
      }

      await applyFactUpdateOrDelete(ctx, driver, {
        clerkId: args.clerkId,
        factText,
        decision,
        buildUpdateReason: ({ factText: ft, decision: d }) =>
          `Instruction: "${args.instruction}"` +
          `\nNew fact: "${ft}"` +
          (d.oldMemory ? `\nOld memory: "${d.oldMemory}"` : ""),
        buildDeleteReason: ({ factText: ft }) =>
          `Instruction: "${args.instruction}" contradicts: "${ft}"`,
        onProposal: (proposal) => {
          proposals.push({
            id: proposal.id,
            memoryId: proposal.memoryId,
            proposedContent: proposal.proposedContent,
            reason: proposal.reason,
            kind: proposal.kind,
            status: proposal.status,
          });
        },
      });
    },
  );

  return {
    applied,
    proposals,
    summary: `Applied ${String(applied.length)} ${applied.length === 1 ? "memory" : "memories"} and created ${String(proposals.length)} ${proposals.length === 1 ? "proposal" : "proposals"}.`,
  };
}
