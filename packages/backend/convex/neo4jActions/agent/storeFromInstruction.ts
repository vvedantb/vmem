"use node";

import type { ActionCtx } from "../../_generated/server";
import type { MemoryWithTags } from "../../../src/neo4j/memory/types";
import { runCreateMemory } from "../memories/create";
import { resolveProfileIdForClerkId } from "../memories/shared";
import {
  computeSdkFactExternalId,
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

    const memory = await runCreateMemory(ctx, {
      clerkId: args.clerkId,
      profileId,
      title: fact.text.slice(0, 80),
      content: fact.text,
      type: "knowledge",
      source: "sdk-api",
      tags: ["sdk-extracted"],
      confidence: 0.9,
      externalId: computeSdkFactExternalId(
        args.clerkId,
        args.instruction,
        index,
        fact.text,
      ),
      sourceType: "sdk-extracted",
    });
    created.push(memory);
  }

  return {
    created,
    summary: `Stored ${String(created.length)} ${created.length === 1 ? "memory" : "memories"} from the instruction.`,
  };
}
