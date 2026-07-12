/**
 * Best-effort OpenRouter embeddings — returns null when the user has no
 * API key or the provider call fails. Callers degrade to fulltext-only
 * or skip vectors; backfill fills gaps later.
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { tryUserAndApiKeyByClerkId } from "../envVars";
import { generateEmbedding, generateEmbeddings } from "./embedding";
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
  return tryUserAndApiKeyByClerkId(ctx, clerkId, "OPENROUTER_API_KEY");
}

export async function bestEffortEmbedOne(
  params: BestEffortEmbedParams & { text: string },
): Promise<number[] | null> {
  const auth = await resolveBestEffortEmbedAuth(params.ctx, params.clerkId);
  return bestEffortEmbedOneWithAuth({ ...params, auth });
}

export async function bestEffortEmbedMany(
  params: BestEffortEmbedParams & { texts: string[] },
): Promise<(number[] | null)[]> {
  const auth = await resolveBestEffortEmbedAuth(params.ctx, params.clerkId);
  return bestEffortEmbedManyWithAuth({ ...params, auth });
}

/** Run `fn`, degrading to `fallback` (with a warning) on any failure. */
async function degradeOnFailure<T, F>(
  fn: () => Promise<T>,
  fallback: F,
  failureLog: string,
): Promise<T | F> {
  try {
    return await fn();
  } catch (e) {
    console.warn(failureLog, e);
    return fallback;
  }
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
  const auth = params.auth;
  return degradeOnFailure(
    () =>
      generateEmbeddings({
        ctx: params.ctx,
        apiKey: auth.apiKey,
        userId: auth.userId,
        profileId: params.profileId,
        feature: params.feature,
        texts: params.texts,
      }),
    params.texts.map(() => null),
    params.failureLog,
  );
}

export async function bestEffortEmbedOneWithAuth(params: {
  ctx: ActionCtx;
  auth: BestEffortEmbedAuth | null;
  profileId?: string;
  feature: OpenRouterFeature;
  text: string;
  failureLog: string;
}): Promise<number[] | null> {
  if (!params.auth) return null;
  const auth = params.auth;
  return degradeOnFailure(
    () =>
      generateEmbedding({
        ctx: params.ctx,
        apiKey: auth.apiKey,
        userId: auth.userId,
        profileId: params.profileId,
        feature: params.feature,
        text: params.text,
      }),
    null,
    params.failureLog,
  );
}
