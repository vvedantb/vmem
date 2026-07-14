"use node";

import type { ActionCtx } from "../../_generated/server";
import { getDriver } from "../../../engine/neo4j/driver";
import type {
  MemoryWithTags,
  ProposedUpdateNode,
} from "../../../engine/neo4j/memory/types";
import type { ExtractedFact, UpdateDecision } from "../../prompts/v2Prompt";
import { applyFactUpdateOrDelete } from "./applyFactDecision";
import {
  runFactDecisionLoop,
  type FactDecisionLoopOptions,
} from "./factDecisionLoop";
import type { AgentAuth } from "./shared";

export type AgentProposal = Pick<
  ProposedUpdateNode,
  "id" | "memoryId" | "proposedContent" | "reason" | "kind" | "status"
>;

export interface ReconcileFactsResult {
  applied: MemoryWithTags[];
  proposals: AgentProposal[];
}

type ReasonArgs = {
  factText: string;
  decision: UpdateDecision;
};

/**
 * Shared decision-loop + ADD/UPDATE/DELETE apply. Callers own variant
 * policy (reason text, ADD creation, loop flags); this owns the mechanics.
 */
export async function reconcileExtractedFacts(
  ctx: ActionCtx,
  params: {
    clerkId: string;
    profileId: string | undefined;
    auth: AgentAuth;
    facts: ExtractedFact[];
    loop: Pick<
      FactDecisionLoopOptions,
      | "retrieveWithProfileId"
      | "excludeMemoryIds"
      | "logPrefix"
      | "bestEffortPerFact"
    >;
    createAdd: (args: {
      factIndex: number;
      text: string;
    }) => Promise<MemoryWithTags | undefined>;
    buildUpdateReason: (args: ReasonArgs) => string;
    buildDeleteReason: (args: ReasonArgs) => string;
    /** When set, forwarded to apply (v2 warns on missing targets; SDK does not). */
    applyLogPrefix?: string;
  },
): Promise<ReconcileFactsResult> {
  const driver = getDriver();
  const applied: MemoryWithTags[] = [];
  const proposals: AgentProposal[] = [];

  await runFactDecisionLoop(
    {
      ctx,
      auth: params.auth,
      clerkId: params.clerkId,
      profileId: params.profileId,
      retrieveWithProfileId: params.loop.retrieveWithProfileId,
      excludeMemoryIds: params.loop.excludeMemoryIds,
      logPrefix: params.loop.logPrefix,
      bestEffortPerFact: params.loop.bestEffortPerFact,
    },
    params.facts,
    async ({ factIndex, factText, decision }) => {
      if (decision.event === "ADD" && decision.text) {
        const memory = await params.createAdd({
          factIndex,
          text: decision.text,
        });
        if (memory) {
          applied.push(memory);
        }
        return;
      }

      await applyFactUpdateOrDelete(driver, {
        clerkId: params.clerkId,
        factText,
        decision,
        logPrefix: params.applyLogPrefix,
        buildUpdateReason: params.buildUpdateReason,
        buildDeleteReason: params.buildDeleteReason,
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

  return { applied, proposals };
}

/** v2 prompt-capture reason templates (notification path). */
export function buildV2UpdateReason({
  factText,
  decision,
}: ReasonArgs): string {
  return (
    `New fact: "${factText}"` +
    (decision.oldMemory ? `\nOld memory: "${decision.oldMemory}"` : "")
  );
}

export function buildV2DeleteReason({ factText }: ReasonArgs): string {
  return `New fact contradicts: "${factText}"`;
}

/** SDK / agent instruction reason templates. */
export function buildSdkUpdateReason(
  instruction: string,
  { factText, decision }: ReasonArgs,
): string {
  return (
    `Instruction: "${instruction}"` +
    `\nNew fact: "${factText}"` +
    (decision.oldMemory ? `\nOld memory: "${decision.oldMemory}"` : "")
  );
}

export function buildSdkDeleteReason(
  instruction: string,
  { factText }: ReasonArgs,
): string {
  return `Instruction: "${instruction}" contradicts: "${factText}"`;
}
