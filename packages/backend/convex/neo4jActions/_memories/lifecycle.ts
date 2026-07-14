"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Driver } from "neo4j-driver";
import { scheduleDreamTriggerCheck } from "../../lib/dreamTriggerInvalidate";
import { scheduleContextPromptInvalidationByClerkId } from "../../lib/contextPromptInvalidate";
import { scheduleMemoryEnrichment } from "./postMaterialize";
import { scheduleChunkSyncForContent } from "./shared";

export type MemoryLifecycleEventType =
  | "memory_created"
  | "memory_updated"
  | "memory_deleted";

// shared post-mutation scheduling
export async function scheduleAfterMemoryMutation(
  ctx: ActionCtx,
  params: {
    clerkId: string;
    event?: {
      type: MemoryLifecycleEventType;
      memoryId: string;
      payload: string;
    };
    enrich?: {
      memoryId: string;
      title: string;
      content: string;
      profileId: string;
    };
    chunk?: {
      driver: Driver;
      memoryId: string;
      content: string;
      profileId?: string;
      mode: "create" | "update";
    };
    extractFacts?: {
      memoryId: string;
      content: string;
      profileId: string;
    };
    checkDream?: boolean;
  },
): Promise<void> {
  if (params.event) {
    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId: params.clerkId,
      eventType: params.event.type,
      memoryId: params.event.memoryId,
      payload: params.event.payload,
    });
  }

  if (params.enrich) {
    await scheduleMemoryEnrichment(ctx, {
      clerkId: params.clerkId,
      memoryId: params.enrich.memoryId,
      title: params.enrich.title,
      content: params.enrich.content,
      profileId: params.enrich.profileId,
    });
  }

  if (params.chunk) {
    await scheduleChunkSyncForContent(ctx, params.chunk.driver, {
      clerkId: params.clerkId,
      memoryId: params.chunk.memoryId,
      content: params.chunk.content,
      profileId: params.chunk.profileId,
      mode: params.chunk.mode,
    });
  }

  if (params.extractFacts) {
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.factExtraction.extractFactsAndDecideInternal,
      {
        clerkId: params.clerkId,
        sourceMemoryId: params.extractFacts.memoryId,
        capturedPrompt: params.extractFacts.content,
        profileId: params.extractFacts.profileId,
      },
    );
  }

  await scheduleContextPromptInvalidationByClerkId(ctx, params.clerkId);

  if (params.checkDream) {
    await scheduleDreamTriggerCheck(ctx, params.clerkId);
  }
}
