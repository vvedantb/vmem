"use node";

import crypto from "node:crypto";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { callJsonChat } from "../../lib/openRouter";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";
import { runCreateMemory } from "../_memories/create";
import { resolveProfileScopeForClerkId } from "../_memories/shared";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import type { ScopeKind } from "../../../engine/neo4j/memory/scope";
import {
  parseFactExtractionResponse,
  parseUpdateDecisionResponse,
  buildFactExtractionPrompt,
  buildUpdateDecisionPrompt,
  type ExtractedFactsResponse,
  type RetrievedCandidate,
  type UpdateDecision,
} from "../../prompts/v2Prompt";

export const RETRIEVAL_TOP_K = 10;

export type OpenRouterRequired = { error: "openrouter_required" };

export type AgentAuth = {
  userId: Id<"users">;
  apiKey: string;
};

// soft fail, null when user or OPENROUTER_API_KEY is missing
export async function tryOpenRouterAuth(
  ctx: ActionCtx,
  clerkId: string,
): Promise<AgentAuth | null> {
  return tryUserAndApiKeyByClerkId(ctx, clerkId, "OPENROUTER_API_KEY");
}

export async function requireOpenRouterAuth(
  ctx: ActionCtx,
  clerkId: string,
): Promise<AgentAuth | OpenRouterRequired> {
  const auth = await tryOpenRouterAuth(ctx, clerkId);
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
): Promise<ExtractedFactsResponse | null> {
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

// stable per fact externalId, hash segments joined with NUL
export function computeFactExternalId(parts: readonly string[]): string {
  const h = crypto.createHash("sha256");
  for (const [i, part] of parts.entries()) {
    if (i > 0) h.update("\0");
    h.update(part);
  }
  return h.digest("hex");
}

const EXTRACTED_FACT_META = {
  sdk: {
    source: "sdk-api",
    tags: ["sdk-extracted"],
    sourceType: "sdk-extracted",
  },
  v2: {
    source: "v2-extracted",
    tags: ["v2-extracted"],
    sourceType: "v2-extracted",
  },
} as const;

// create a memory from an extracted fact
export async function createExtractedFactMemory(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    profileId: string | undefined;
    factIndex: number;
    text: string;
    variant: keyof typeof EXTRACTED_FACT_META;
    externalIdScope: readonly string[];
  },
): Promise<MemoryWithTags> {
  const meta = EXTRACTED_FACT_META[args.variant];
  return runCreateMemory(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    title: args.text.slice(0, 80),
    content: args.text,
    type: "knowledge",
    source: meta.source,
    tags: [...meta.tags],
    confidence: 0.9,
    externalId: computeFactExternalId([
      ...args.externalIdScope,
      String(args.factIndex),
      args.text,
    ]),
    sourceType: meta.sourceType,
  });
}

export async function prepareInstructionFacts(
  ctx: ActionCtx,
  args: { clerkId: string; instruction: string; profileId?: string },
): Promise<
  | OpenRouterRequired
  | { empty: true }
  | {
      auth: AgentAuth;
      profileId: string;
      graphScope: ScopeKind;
      facts: ExtractedFactsResponse["facts"];
    }
> {
  const auth = await requireOpenRouterAuth(ctx, args.clerkId);
  if ("error" in auth) return auth;

  const { profileId, graphScope } = await resolveProfileScopeForClerkId(
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
    return { empty: true };
  }

  return { auth, profileId, graphScope, facts: extracted.facts };
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
