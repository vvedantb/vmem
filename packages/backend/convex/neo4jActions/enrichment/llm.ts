"use node";

import type { Driver } from "neo4j-driver";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { getRecentMemoryTitles } from "../../../engine/neo4j/memory/search";
import { getTopTags } from "../../../engine/neo4j/memory/tags";
import { getTopEntities } from "../../../engine/neo4j/memory/entities";
import type { TagUsage } from "../../../engine/neo4j/memory/tagNormalize";
import { callJsonChat } from "../../lib/openRouter";
import type { OpenRouterFeature } from "../../lib/openRouter/shared";
import {
  buildFullEnrichmentPrompt,
  parseFullEnrichmentResponse,
  type EnrichmentCandidate,
  type KnownEntity,
  type ParsedFullEnrichment,
} from "../../prompts/enrichmentPrompt";

const ENRICHMENT_ROLE =
  "You are a memory tagging and entity extraction system.";

export interface EnrichmentVocabulary {
  recentTitles: EnrichmentCandidate[];
  topTags: TagUsage[];
  topEntities?: KnownEntity[];
}

export interface EnrichmentAuth {
  userId: Id<"users">;
  apiKey: string;
}

export async function loadEnrichmentVocabulary(
  driver: Driver,
  clerkId: string,
  opts?: { excludeMemoryId?: string; includeEntities?: boolean },
): Promise<EnrichmentVocabulary> {
  const excludeMemoryId = opts?.excludeMemoryId ?? "";
  const includeEntities = opts?.includeEntities ?? false;

  if (includeEntities) {
    const [recentTitles, topTags, topEntities] = await Promise.all([
      getRecentMemoryTitles(driver, clerkId, excludeMemoryId),
      getTopTags(driver, clerkId, 50),
      getTopEntities(driver, clerkId, 150),
    ]);
    return { recentTitles, topTags, topEntities };
  }

  const [recentTitles, topTags] = await Promise.all([
    getRecentMemoryTitles(driver, clerkId, excludeMemoryId),
    getTopTags(driver, clerkId, 50),
  ]);
  return { recentTitles, topTags };
}

export async function callFullEnrichmentLlm(
  ctx: ActionCtx,
  auth: EnrichmentAuth,
  params: {
    title: string;
    content: string;
    profileId?: string;
    feature: OpenRouterFeature;
    vocabulary: EnrichmentVocabulary;
  },
): Promise<ParsedFullEnrichment | null> {
  const prompt = buildFullEnrichmentPrompt(
    params.title,
    params.content,
    params.vocabulary.recentTitles,
    params.vocabulary.topTags,
    params.vocabulary.topEntities ?? [],
  );

  const rawText = await callJsonChat(ctx, {
    apiKey: auth.apiKey,
    userId: auth.userId,
    profileId: params.profileId,
    feature: params.feature,
    role: ENRICHMENT_ROLE,
    prompt,
  });

  if (rawText === null) return null;
  return parseFullEnrichmentResponse(rawText);
}
