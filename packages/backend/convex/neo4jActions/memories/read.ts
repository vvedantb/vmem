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
import { callOpenRouterChat, LLM_MODEL } from "../../lib/openRouter";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";
import {
  toMemoryStatus,
  toMemoryType,
  tryEmbedMany,
  tryEmbedOne,
} from "./shared";

function extractJsonArray(source: string): string | null {
  const start = source.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "[") depth++;
    if (char === "]") depth--;
    if (depth === 0) return source.slice(start + 1, i);
  }

  return null;
}

function readJsonString(source: string, startIndex: number): string | null {
  if (source[startIndex] !== '"') return null;
  let out = "";

  for (let i = startIndex + 1; i < source.length; i++) {
    const char = source[i];
    if (char === '"') return out;
    if (char !== "\\") {
      out += char;
      continue;
    }

    const escaped = source[i + 1];
    if (escaped === undefined) return null;
    i++;

    if (escaped === "n") out += "\n";
    else if (escaped === "r") out += "\r";
    else if (escaped === "t") out += "\t";
    else if (escaped === "b") out += "\b";
    else if (escaped === "f") out += "\f";
    else if (escaped === "u") {
      const code = source.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(code)) return null;
      out += String.fromCharCode(Number.parseInt(code, 16));
      i += 4;
    } else {
      out += escaped;
    }
  }

  return null;
}

function parseStringArray(content: string): string[] {
  const rawArray = extractJsonArray(content);
  if (rawArray !== null) {
    const values: string[] = [];
    let index = 0;
    while (index < rawArray.length) {
      const quoteIndex = rawArray.indexOf('"', index);
      if (quoteIndex === -1) break;
      const value = readJsonString(rawArray, quoteIndex);
      if (value === null) break;
      const trimmed = value.trim();
      if (trimmed) values.push(trimmed);
      index = quoteIndex + value.length + 2;
    }
    if (values.length > 0) return values;
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.]+\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 2);
}

function parseNumberArray(
  content: string,
  expectedCount: number,
): number[] | null {
  const rawArray = extractJsonArray(content);
  if (rawArray === null) return null;
  const scores = rawArray
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  return scores.length === expectedCount ? scores : null;
}

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
  profileId?: string;
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
    profileId: args.profileId,
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

async function tryRetrievalChat(
  ctx: ActionCtx,
  args: Pick<RetrieveMemoriesArgs, "clerkId" | "profileId">,
  system: string,
  user: string,
): Promise<string | null> {
  try {
    const auth = await tryUserAndApiKeyByClerkId(
      ctx,
      args.clerkId,
      "OPENROUTER_API_KEY",
    );
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

    if (!result.ok || result.content === null) {
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
  return parseStringArray(content)
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
  const scores = parseNumberArray(content, candidates.length);
  if (scores === null) {
    console.warn("[retrieve] rerank response parse failed");
  }
  return scores;
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
        tryEmbedMany(ctx, {
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
