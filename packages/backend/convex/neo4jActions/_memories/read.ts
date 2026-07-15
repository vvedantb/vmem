"use node";

import type { ActionCtx } from "../../_generated/server";
import type {
  ListMemoriesInternalArgs,
  SearchMemoriesInternalArgs,
} from "../../memoryApi/validators";
import { getMemory, listMemories } from "../../../engine/neo4j/memory/crud";
import { retrieveMemories } from "../../../engine/neo4j/memory/retrieve";
import { getDriver } from "../../../engine/neo4j/driver";
import { callOpenRouterChat, LLM_MODEL } from "../../lib/openRouter";
import {
  parseLlmNumberArray,
  parseLlmStringArray,
} from "../../../engine/llm/extractJsonString";
import { tryOpenRouterAuth } from "../agent/shared";
import {
  bestEffortEmbedMany,
  bestEffortEmbedOne,
} from "../../lib/openRouter/bestEffortEmbed";
import { toMemoryStatus, toMemoryType } from "./shared";

export async function runGetMemory(args: {
  clerkId: string;
  memoryId: string;
}) {
  const driver = getDriver();
  return await getMemory(driver, args.clerkId, args.memoryId);
}

export async function runListMemories(args: ListMemoriesInternalArgs) {
  const driver = getDriver();
  return await listMemories(driver, {
    userId: args.clerkId,
    profileId: args.profileId,
    type: toMemoryType(args.type),
    status: toMemoryStatus(args.status),
    source: args.source,
    tags: args.tags,
    searchQuery: args.searchQuery,
    limit: args.limit,
    offset: args.offset,
  });
}

export async function runSearchMemories(args: SearchMemoriesInternalArgs) {
  return runListMemories({
    clerkId: args.clerkId,
    profileId: args.profileId,
    type: args.type,
    tags: args.tags,
    source: args.source,
    searchQuery: args.query,
    limit: args.limit,
    offset: args.offset,
  });
}

export interface RetrieveMemoriesArgs {
  clerkId: string;
  profileId?: string;
  query: string;
  type?: string;
  tags?: string[];
  limit: number;
}

async function tryRetrievalChat(
  ctx: ActionCtx,
  args: Pick<RetrieveMemoriesArgs, "clerkId" | "profileId">,
  system: string,
  user: string,
): Promise<string | null> {
  try {
    const auth = await tryOpenRouterAuth(ctx, args.clerkId);
    if (!auth) return null;

    const result = await callOpenRouterChat(ctx, {
      apiKey: auth.apiKey,
      userId: auth.userId,
      profileId: args.profileId,
      feature: "memory-search",
      model: LLM_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
    });

    if (result.content === null) {
      console.warn("[retrieve] OpenRouter helper returned no content");
      return null;
    }

    return result.content;
  } catch (error) {
    console.warn("[retrieve] OpenRouter helper failed", error);
    return null;
  }
}

async function generateRetrievalParaphrases(
  ctx: ActionCtx,
  args: Pick<RetrieveMemoriesArgs, "clerkId" | "profileId">,
  query: string,
): Promise<string[]> {
  const content = await tryRetrievalChat(
    ctx,
    args,
    "Generate exactly two search paraphrases. Return a JSON array of strings and nothing else.",
    query,
  );
  if (content === null) return [];
  return parseLlmStringArray(content)
    .filter((value) => value.toLowerCase() !== query.toLowerCase())
    .slice(0, 2);
}

async function rerankRetrievalCandidates(
  ctx: ActionCtx,
  args: Pick<RetrieveMemoriesArgs, "clerkId" | "profileId">,
  query: string,
  candidates: Array<{ title: string; content: string }>,
): Promise<number[] | null> {
  const body = candidates
    .map(
      (candidate, index) =>
        `${String(index + 1)}. ${candidate.title}\n${candidate.content.slice(0, 500)}`,
    )
    .join("\n\n");

  const content = await tryRetrievalChat(
    ctx,
    args,
    "Score each memory's relevance to the query, 0-10. Return a JSON array of numbers in the input order, nothing else.",
    `Query: ${query}\n\nMemories:\n${body}`,
  );
  if (content === null) return null;
  const scores = parseLlmNumberArray(content, candidates.length);
  if (scores === null) {
    console.warn("[retrieve] rerank response parse failed");
  }
  return scores;
}

export async function runRetrieveMemories(
  ctx: ActionCtx,
  args: RetrieveMemoriesArgs,
) {
  const driver = getDriver();
  const queryEmbedding = await bestEffortEmbedOne({
    ctx,
    clerkId: args.clerkId,
    profileId: args.profileId,
    feature: "memory-search",
    text: args.query,
    failureLog: "query embedding failed, falling back to fulltext",
  });

  return await retrieveMemories(driver, {
    userId: args.clerkId,
    profileId: args.profileId,
    query: args.query,
    queryEmbedding,
    type: toMemoryType(args.type),
    tags: args.tags,
    limit: args.limit,
    queryExpansion: {
      generateParaphrases: (query) =>
        generateRetrievalParaphrases(ctx, args, query),
      embedTexts: (texts) =>
        bestEffortEmbedMany({
          ctx,
          clerkId: args.clerkId,
          profileId: args.profileId,
          feature: "memory-search",
          texts,
          failureLog: "query expansion embedding failed",
        }),
    },
    rerankCandidates: (query, candidates) =>
      rerankRetrievalCandidates(ctx, args, query, candidates),
  });
}
