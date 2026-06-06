"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getMemory } from "../../../src/neo4j/memory/crud";
import { retrieveMemories } from "../../../src/neo4j/memory/retrieve";
import type { MemoryWithTags } from "../../../src/neo4j/memory/types";
import { getDriver } from "../../../src/neo4j/driver";
import { generateEmbedding } from "../../lib/openRouter";
import { resolveProfileIdForClerkId } from "../memories/shared";
import {
  decideFactUpdate,
  extractFactsFromInstruction,
  computeSdkFactExternalId,
  requireOpenRouterAuth,
  RETRIEVAL_TOP_K,
  toDecisionCandidates,
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
  const { runCreateMemory } =
    await import("../../../src/convexHandlers/memories/create");
  const applied: MemoryWithTags[] = [];
  const proposals: AgentProposal[] = [];

  for (let index = 0; index < extracted.facts.length; index++) {
    const fact = extracted.facts[index];
    if (!fact) {
      continue;
    }

    let factEmbedding: number[] | null = null;
    try {
      factEmbedding = await generateEmbedding({
        ctx,
        apiKey: auth.apiKey,
        userId: auth.userId,
        profileId,
        feature: "fact-extraction",
        text: fact.text,
      });
    } catch (error) {
      console.warn(
        `[agent] Fact embedding failed for "${fact.text.slice(0, 40)}..."`,
        error,
      );
    }

    const retrieved = await retrieveMemories(driver, {
      userId: args.clerkId,
      profileId,
      query: fact.text,
      queryEmbedding: factEmbedding,
      limit: RETRIEVAL_TOP_K,
    });

    const decision = await decideFactUpdate(
      ctx,
      auth,
      profileId,
      fact.text,
      toDecisionCandidates(retrieved),
    );

    if (!decision) {
      continue;
    }

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
      continue;
    }

    if (decision.event === "UPDATE" && decision.id && decision.text) {
      const target = await getMemory(driver, args.clerkId, decision.id);
      if (!target) {
        continue;
      }
      const reason =
        `Instruction: "${args.instruction}"` +
        `\nNew fact: "${fact.text}"` +
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
      continue;
    }

    if (decision.event === "DELETE" && decision.id) {
      const target = await getMemory(driver, args.clerkId, decision.id);
      if (!target) {
        continue;
      }
      const reason = `Instruction: "${args.instruction}" contradicts: "${fact.text}"`;
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
  }

  return {
    applied,
    proposals,
    summary: `Applied ${String(applied.length)} ${applied.length === 1 ? "memory" : "memories"} and created ${String(proposals.length)} ${proposals.length === 1 ? "proposal" : "proposals"}.`,
  };
}
