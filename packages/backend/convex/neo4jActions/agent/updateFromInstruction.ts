"use node";

import type { ActionCtx } from "../../_generated/server";
import type {
  MemoryWithTags,
  ProposedUpdateNode,
} from "../../../engine/neo4j/memory/types";
import { getDriver } from "../../../engine/neo4j/driver";
import { applyFactUpdateOrDelete } from "./applyFactDecision";
import { runFactDecisionLoop } from "./factDecisionLoop";
import {
  createSdkExtractedMemory,
  prepareInstructionFacts,
  type OpenRouterRequired,
} from "./shared";

export type AgentProposal = Pick<
  ProposedUpdateNode,
  "id" | "memoryId" | "proposedContent" | "reason" | "kind" | "status"
>;

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
  const prepared = await prepareInstructionFacts(ctx, args);
  if ("error" in prepared) return prepared;
  if ("empty" in prepared) {
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
      auth: prepared.auth,
      clerkId: args.clerkId,
      profileId: prepared.profileId,
      retrieveWithProfileId: true,
      logPrefix: "[agent]",
    },
    prepared.facts,
    async ({ factIndex: index, factText, decision }) => {
      if (decision.event === "ADD" && decision.text) {
        applied.push(
          await createSdkExtractedMemory(ctx, {
            clerkId: args.clerkId,
            profileId: prepared.profileId,
            instruction: args.instruction,
            factIndex: index,
            text: decision.text,
          }),
        );
        return;
      }

      await applyFactUpdateOrDelete(driver, {
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
