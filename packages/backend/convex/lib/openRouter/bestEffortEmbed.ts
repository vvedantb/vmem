// best-effort embeddings, null when no api key or provider failure

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { tryUserAndApiKeyByClerkId } from "../envVars";
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
  return tryUserAndApiKeyByClerkId(ctx, clerkId, "OPENROUTER_API_KEY");
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
