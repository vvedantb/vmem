"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Driver } from "neo4j-driver";
import { setEmbeddings } from "../../../engine/neo4j/memory/migration";
import type { OpenRouterFeature } from "../../lib/openRouter/shared";
import { tryEmbedOne } from "./shared";

/** Best-effort embed (unless already at create) + schedule enrichment. */
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
    /** Omit to embed here; set (incl. null) when CREATE already embedded. */
    embeddingAtCreate?: number[] | null;
  },
): Promise<void> {
  if (params.embeddingAtCreate === undefined) {
    const embedding = await tryEmbedOne(ctx, {
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
