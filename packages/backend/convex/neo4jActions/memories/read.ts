"use node";

/**
 * Memory read handlers: simple lookups (`get`, `events`, recent titles)
 * and the search/retrieve pair (BM25 vs hybrid retrieve with embedding).
 */

import { type ActionCtx } from "../../_generated/server";
import {
  getMemory,
  getMemoryEvents,
  getRecentMemoryTitles,
  listMemories,
  retrieveMemories,
  searchMemories,
} from "../../../src/neo4j/memoryService";
import { getDriver } from "../../../src/neo4j/driver";
import { toMemoryStatus, toMemoryType, tryEmbedOne } from "./shared";

export async function runGetMemory(args: {
  clerkId: string;
  memoryId: string;
}) {
  const driver = getDriver();
  return await getMemory(driver, args.clerkId, args.memoryId);
}

export interface ListMemoriesArgs {
  clerkId: string;
  profileId?: string;
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  limit: number;
  offset: number;
}

export async function runListMemories(args: ListMemoriesArgs) {
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

export interface SearchMemoriesArgs {
  clerkId: string;
  query?: string;
  type?: string;
  tags?: string[];
  source?: string;
  limit: number;
  offset: number;
}

export async function runSearchMemories(args: SearchMemoriesArgs) {
  const driver = getDriver();
  return await searchMemories(driver, {
    userId: args.clerkId,
    query: args.query,
    type: toMemoryType(args.type),
    tags: args.tags,
    source: args.source,
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

/**
 * Hybrid retrieval: best-effort query embedding (falls back to
 * fulltext-only when the user has no OPENROUTER_API_KEY or the call
 * fails — the service records the degraded state in the trace reason).
 */
export async function runRetrieveMemories(
  ctx: ActionCtx,
  args: RetrieveMemoriesArgs,
) {
  const driver = getDriver();
  const queryEmbedding = await tryEmbedOne(ctx, {
    clerkId: args.clerkId,
    profileId: args.profileId,
    feature: "memory-search",
    text: args.query,
    failureLog: "query embedding failed, falling back to fulltext",
  });

  return await retrieveMemories(driver, {
    userId: args.clerkId,
    query: args.query,
    queryEmbedding,
    type: toMemoryType(args.type),
    tags: args.tags,
    limit: args.limit,
  });
}

export async function runGetMemoryEvents(args: {
  clerkId: string;
  memoryId: string;
}) {
  const driver = getDriver();
  return await getMemoryEvents(driver, args.clerkId, args.memoryId);
}

export async function runGetRecentMemoryTitles(args: {
  clerkId: string;
  excludeMemoryId: string;
}) {
  const driver = getDriver();
  return await getRecentMemoryTitles(
    driver,
    args.clerkId,
    args.excludeMemoryId,
  );
}
