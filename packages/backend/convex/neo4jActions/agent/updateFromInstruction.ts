"use node";

import type { ActionCtx } from "../../_generated/server";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import {
  createExtractedFactMemory,
  prepareInstructionFacts,
  type OpenRouterRequired,
} from "./shared";
import {
  buildSdkDeleteReason,
  buildSdkUpdateReason,
  reconcileExtractedFacts,
  type AgentProposal,
} from "./reconcileFacts";

export type { AgentProposal };

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

  const { applied, proposals } = await reconcileExtractedFacts(ctx, {
    clerkId: args.clerkId,
    profileId: prepared.profileId,
    auth: prepared.auth,
    facts: prepared.facts,
    loop: {
      graphScope: prepared.graphScope,
      retrieveWithProfileId: true,
      logPrefix: "[agent]",
    },
    createAdd: ({ factIndex, text }) =>
      createExtractedFactMemory(ctx, {
        clerkId: args.clerkId,
        profileId: prepared.profileId,
        factIndex,
        text,
        variant: "sdk",
        externalIdScope: [args.clerkId, args.instruction],
      }),
    buildUpdateReason: (reasonArgs) =>
      buildSdkUpdateReason(args.instruction, reasonArgs),
    buildDeleteReason: (reasonArgs) =>
      buildSdkDeleteReason(args.instruction, reasonArgs),
  });

  return {
    applied,
    proposals,
    summary: `Applied ${String(applied.length)} ${applied.length === 1 ? "memory" : "memories"} and created ${String(proposals.length)} ${proposals.length === 1 ? "proposal" : "proposals"}.`,
  };
}
