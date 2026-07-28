"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Driver } from "neo4j-driver";
import { setEmbeddings } from "../../../engine/neo4j/memory/migration";
import { bestEffortEmbedOne } from "../../lib/openRouter/bestEffortEmbed";
import type { OpenRouterFeature } from "../../lib/openRouter/shared";

// AI-generated (Claude), prompt: "after materializing a memory embed content and schedule enrichment without blocking the write path"
// Modified by me: best effort embed failures and enrichment scheduling hooks
export async function postMaterializeEmbedAndEnrich(
  ctx: ActionCtx,
  driver: Driver,
  params: {
    clerkId: string;
    memoryId: string;
    title: string;
    content: string;
    profileId?: string;
    feature: OpenRouterFeature;
    failureLog: string;
    // omit to embed here. set (incl
    embeddingAtCreate?: number[] | null;
  },
): Promise<void> {
  if (params.embeddingAtCreate === undefined) {
    const embedding = await bestEffortEmbedOne({
      ctx,
      clerkId: params.clerkId,
      profileId: params.profileId,
      feature: params.feature,
      text: `${params.title}\n\n${params.content}`,
      failureLog: params.failureLog,
    });
    if (embedding) {
      await setEmbeddings(driver, [{ id: params.memoryId, embedding }]);
    }
  }

  await scheduleMemoryEnrichment(ctx, {
    clerkId: params.clerkId,
    memoryId: params.memoryId,
    title: params.title,
    content: params.content,
    profileId: params.profileId,
  });
}

export async function scheduleMemoryEnrichment(
  ctx: ActionCtx,
  params: {
    clerkId: string;
    memoryId: string;
    title: string;
    content: string;
    profileId?: string;
  },
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal.neo4jActions.enrichment.enrichMemoryInternal,
    {
      clerkId: params.clerkId,
      memoryId: params.memoryId,
      title: params.title,
      content: params.content,
      profileId: params.profileId,
    },
  );
}
