"use node";

import type { ActionCtx } from "../../_generated/server";
import { resolveCreateWithDedup } from "../../../engine/neo4j/memory/dedup";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import { getDriver } from "../../../engine/neo4j/driver";
import { bestEffortEmbedOne } from "../../lib/openRouter/bestEffortEmbed";
import { resolveProfileIdForClerkId, toMemoryType } from "./shared";
import { scheduleAfterMemoryMutation } from "./lifecycle";

export interface CreateMemoryArgs {
  clerkId: string;
  profileId?: string;
  title: string;
  content: string;
  type: string;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
  externalId?: string;
  sourceType?: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
}

export async function runCreateMemory(
  ctx: ActionCtx,
  args: CreateMemoryArgs,
): Promise<MemoryWithTags> {
  const driver = getDriver();
  const profileId = await resolveProfileIdForClerkId(
    ctx,
    args.clerkId,
    args.profileId,
  );

  const { memory, created } = await resolveCreateWithDedup(driver, {
    userId: args.clerkId,
    profileId,
    title: args.title,
    content: args.content,
    type: toMemoryType(args.type) ?? "knowledge",
    source: args.source,
    tags: args.tags,
    confidence: args.confidence,
    expiresAt: args.expiresAt,
    url: args.url,
    externalId: args.externalId,
    sourceType: args.sourceType,
    storageId: args.storageId,
    mimeType: args.mimeType,
    originalFilename: args.originalFilename,
    embed: () =>
      bestEffortEmbedOne({
        ctx,
        clerkId: args.clerkId,
        profileId,
        feature: "memory-save",
        text: `${args.title}\n\n${args.content}`,
        failureLog: "embedding failed on create",
      }),
  });

  if (!created) return memory;

  const shouldExtractFacts =
    args.source === "prompt-capture" && args.sourceType !== "v2-extracted";

  await scheduleAfterMemoryMutation(ctx, {
    clerkId: args.clerkId,
    event: {
      type: "memory_created",
      memoryId: memory.id,
      payload: JSON.stringify({ title: memory.title }),
    },
    enrich: {
      memoryId: memory.id,
      title: memory.title,
      content: args.content,
      profileId,
    },
    chunk: {
      driver,
      memoryId: memory.id,
      content: args.content,
      profileId,
      mode: "create",
    },
    extractFacts: shouldExtractFacts
      ? {
          memoryId: memory.id,
          content: args.content,
          profileId,
        }
      : undefined,
    checkDream: args.source !== "dream-mode",
  });

  return memory;
}
