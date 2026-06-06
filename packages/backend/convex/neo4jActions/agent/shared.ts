"use node";

import crypto from "node:crypto";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { callJsonChat } from "../../lib/openRouter";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";
import {
  parseFactExtractionResponse,
  parseUpdateDecisionResponse,
  buildFactExtractionPrompt,
  buildUpdateDecisionPrompt,
  type RetrievedCandidate,
  type UpdateDecision,
} from "../../prompts/v2Prompt";

export const RETRIEVAL_TOP_K = 10;

export type OpenRouterRequired = { error: "openrouter_required" };

export type AgentAuth = {
  userId: Id<"users">;
  apiKey: string;
};

export async function requireOpenRouterAuth(
  ctx: ActionCtx,
  clerkId: string,
): Promise<AgentAuth | OpenRouterRequired> {
  const auth = await tryUserAndApiKeyByClerkId(
    ctx,
    clerkId,
    "OPENROUTER_API_KEY",
  );
  if (!auth) {
    return { error: "openrouter_required" };
  }
  return auth;
}

export async function callAgentLLM(
  ctx: ActionCtx,
  auth: AgentAuth,
  profileId: string | undefined,
  feature: "fact-extraction" | "memory-search",
  prompt: string,
): Promise<string | null> {
  return callJsonChat(ctx, {
    apiKey: auth.apiKey,
    userId: auth.userId,
    profileId,
    feature,
    prompt,
  });
}

export async function extractFactsFromInstruction(
  ctx: ActionCtx,
  auth: AgentAuth,
  instruction: string,
  profileId: string | undefined,
) {
  const observationDate = new Date().toISOString();
  const extractionPrompt = buildFactExtractionPrompt(
    instruction,
    observationDate,
    observationDate,
  );
  const extractionRaw = await callAgentLLM(
    ctx,
    auth,
    profileId,
    "fact-extraction",
    extractionPrompt,
  );
  if (!extractionRaw) {
    return null;
  }
  return parseFactExtractionResponse(extractionRaw);
}

export function computeSdkFactExternalId(
  clerkId: string,
  instruction: string,
  factIndex: number,
  factText: string,
): string {
  const h = crypto.createHash("sha256");
  h.update(clerkId);
  h.update("\0");
  h.update(instruction);
  h.update("\0");
  h.update(String(factIndex));
  h.update("\0");
  h.update(factText);
  return h.digest("hex");
}

export function toDecisionCandidates(
  candidates: { id: string; title: string; content: string }[],
): RetrievedCandidate[] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    text: candidate.title
      ? `${candidate.title}\n${candidate.content}`
      : candidate.content,
  }));
}

export async function decideFactUpdate(
  ctx: ActionCtx,
  auth: AgentAuth,
  profileId: string | undefined,
  factText: string,
  candidates: RetrievedCandidate[],
): Promise<UpdateDecision | null> {
  const decisionPrompt = buildUpdateDecisionPrompt(factText, candidates);
  const decisionRaw = await callAgentLLM(
    ctx,
    auth,
    profileId,
    "fact-extraction",
    decisionPrompt,
  );
  if (!decisionRaw) {
    return null;
  }
  return parseUpdateDecisionResponse(decisionRaw);
}
