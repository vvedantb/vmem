// best-effort embeddings, null when no api key or provider failure

import { sha256Hex } from "@vvedantb/server";
import { AI_GATEWAY_EMBEDDING_MODEL } from "../../../engine/llm/aiGateway";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { QUERY_EMBEDDING_CACHE_TTL_MS } from "../../queryEmbeddingCache";
import { readOpenRouterApiKey, resolveOpenRouterAuth } from "../openRouterKey";
import { generateEmbeddings } from "./embedding";
import type { OpenRouterFeature } from "./shared";

export interface BestEffortEmbedAuth {
  apiKey: string;
  userId: Id<"users">;
}

export interface BestEffortEmbedParams {
  ctx: ActionCtx;
  clerkId: string;
  profileId?: string;
  feature: OpenRouterFeature;
  failureLog: string;
}

export async function resolveBestEffortEmbedAuth(
  ctx: ActionCtx,
  clerkId: string,
): Promise<BestEffortEmbedAuth | null> {
  return resolveOpenRouterAuth(ctx, clerkId);
}

export async function bestEffortEmbedOne(
  params: BestEffortEmbedParams & { text: string },
): Promise<number[] | null> {
  const [embedding] = await bestEffortEmbedMany({
    ...params,
    texts: [params.text],
  });
  return embedding ?? null;
}

// per user, so one user's cached query never answers another's
async function queryEmbeddingCacheKey(
  clerkId: string,
  text: string,
): Promise<string> {
  return sha256Hex(`${clerkId}\n${AI_GATEWAY_EMBEDDING_MODEL}\n${text}`);
}

/**
 * bestEffortEmbedOne behind the queryEmbeddingCache table: an identical
 * text from the same user within the TTL skips the network call. Only a
 * real vector is cached; with no API key nothing is read or written.
 */
export async function bestEffortEmbedQueryCached(
  params: BestEffortEmbedParams & { text: string },
): Promise<{ embedding: number[] | null; cached: boolean }> {
  if (readOpenRouterApiKey() === undefined) {
    return { embedding: null, cached: false };
  }
  const key = await queryEmbeddingCacheKey(params.clerkId, params.text);
  const hit = await params.ctx.runQuery(
    internal.queryEmbeddingCache.getInternal,
    {
      key,
    },
  );
  if (hit !== null && hit.expiresAt > Date.now()) {
    return { embedding: hit.embedding, cached: true };
  }
  const embedding = await bestEffortEmbedOne(params);
  if (embedding !== null) {
    try {
      await params.ctx.runMutation(internal.queryEmbeddingCache.putInternal, {
        key,
        embedding,
        expiresAt: Date.now() + QUERY_EMBEDDING_CACHE_TTL_MS,
      });
    } catch (err) {
      console.warn("[embedding] query cache write failed:", err);
    }
  }
  return { embedding, cached: false };
}

export async function bestEffortEmbedMany(
  params: BestEffortEmbedParams & { texts: string[] },
): Promise<(number[] | null)[]> {
  const auth = await resolveBestEffortEmbedAuth(params.ctx, params.clerkId);
  return bestEffortEmbedManyWithAuth({ ...params, auth });
}

export async function bestEffortEmbedManyWithAuth(params: {
  ctx: ActionCtx;
  auth: BestEffortEmbedAuth | null;
  profileId?: string;
  feature: OpenRouterFeature;
  texts: string[];
  failureLog: string;
}): Promise<(number[] | null)[]> {
  if (!params.auth) return params.texts.map(() => null);
  try {
    return await generateEmbeddings({
      ctx: params.ctx,
      apiKey: params.auth.apiKey,
      userId: params.auth.userId,
      profileId: params.profileId,
      feature: params.feature,
      texts: params.texts,
    });
  } catch (e) {
    console.warn(params.failureLog, e);
    return params.texts.map(() => null);
  }
}

export async function bestEffortEmbedOneWithAuth(params: {
  ctx: ActionCtx;
  auth: BestEffortEmbedAuth | null;
  profileId?: string;
  feature: OpenRouterFeature;
  text: string;
  failureLog: string;
}): Promise<number[] | null> {
  const [embedding] = await bestEffortEmbedManyWithAuth({
    ctx: params.ctx,
    auth: params.auth,
    profileId: params.profileId,
    feature: params.feature,
    texts: [params.text],
    failureLog: params.failureLog,
  });
  return embedding ?? null;
}
