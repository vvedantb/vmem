"use node";

import type { ActionCtx } from "../../_generated/server";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import { resolveProfileIdForClerkId } from "../_memories/shared";
import {
  createSdkExtractedMemory,
  extractFactsFromInstruction,
  requireOpenRouterAuth,
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
      created: [],
      summary: "No durable facts found in the instruction.",
    };
  }

  const created: MemoryWithTags[] = [];

  for (let index = 0; index < extracted.facts.length; index++) {
    const fact = extracted.facts[index];
    if (!fact) {
      continue;
    }

    const memory = await createSdkExtractedMemory(ctx, {
      clerkId: args.clerkId,
      profileId,
      instruction: args.instruction,
      factIndex: index,
      text: fact.text,
    });
    created.push(memory);
  }

  return {
    created,
    summary: `Stored ${String(created.length)} ${created.length === 1 ? "memory" : "memories"} from the instruction.`,
  };
}
