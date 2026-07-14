"use node";

import type { ActionCtx } from "../../_generated/server";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import {
  createExtractedFactMemory,
  prepareInstructionFacts,
  type OpenRouterRequired,
} from "./shared";

export interface StoreFromInstructionArgs {
  clerkId: string;
  instruction: string;
  profileId?: string;
}

export interface StoreFromInstructionResult {
  created: MemoryWithTags[];
  summary: string;
}

export async function runStoreFromInstruction(
  ctx: ActionCtx,
  args: StoreFromInstructionArgs,
): Promise<StoreFromInstructionResult | OpenRouterRequired> {
  const prepared = await prepareInstructionFacts(ctx, args);
  if ("error" in prepared) return prepared;
  if ("empty" in prepared) {
    return {
      created: [],
      summary: "No durable facts found in the instruction.",
    };
  }

  const created: MemoryWithTags[] = [];

  for (let index = 0; index < prepared.facts.length; index++) {
    const fact = prepared.facts[index];
    if (!fact) continue;

    created.push(
      await createExtractedFactMemory(ctx, {
        clerkId: args.clerkId,
        profileId: prepared.profileId,
        factIndex: index,
        text: fact.text,
        variant: "sdk",
        externalIdScope: [args.clerkId, args.instruction],
      }),
    );
  }

  return {
    created,
    summary: `Stored ${String(created.length)} ${created.length === 1 ? "memory" : "memories"} from the instruction.`,
  };
}
