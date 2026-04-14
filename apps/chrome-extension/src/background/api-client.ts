import { ConvexHttpClient } from "convex/browser";
import { api } from "@vmem/backend";
import { getStorage } from "@/lib/storage";
import { CONVEX_URL } from "@/lib/constants";
import type {
  CreateMemoryParams,
  MemoryWithTags,
  MemoryCandidate,
} from "@/types/api";

/**
 * Get an authenticated ConvexHttpClient with the stored Clerk JWT.
 * Returns null if no auth token is available.
 */
async function getAuthenticatedClient(): Promise<ConvexHttpClient | null> {
  const { authToken } = await getStorage();
  if (!authToken) {
    console.warn("[vmem] No auth token available for Convex client");
    return null;
  }

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(authToken);
  return client;
}

export interface DuplicateInfo {
  id: string;
  title: string;
  updatedAt: string;
}

export type CreateResult =
  | { status: "created"; memory: MemoryWithTags }
  | { status: "duplicate"; existingMemory: DuplicateInfo };

export async function createMemory(
  params: CreateMemoryParams,
): Promise<CreateResult> {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }

  const memory = await client.action(api.memoryApi.createMemory, {
    title: params.title,
    content: params.content,
    type: params.type,
    source: params.source,
    tags: params.tags,
    confidence: params.confidence,
    url: params.url,
  });

  return { status: "created", memory };
}

export async function updateMemory(
  memoryId: string,
  params: { title?: string; content?: string; tags?: string[] },
): Promise<MemoryWithTags> {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }

  const result = await client.action(api.memoryApi.updateMemory, {
    memoryId,
    title: params.title,
    content: params.content,
    tags: params.tags,
  });

  if (!result) {
    throw new Error("Memory not found or update failed");
  }

  return result;
}

export async function retrieveMemories(
  query: string,
  limit = 5,
): Promise<MemoryCandidate[]> {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }

  return await client.action(api.memoryApi.retrieveMemories, {
    query,
    limit,
  });
}

export async function listRecentMemoryTitlesForEnrichment(
  excludeMemoryId: string,
): Promise<Array<{ id: string; title: string }>> {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }

  return await client.action(
    api.memoryApi.listRecentMemoryTitlesForEnrichment,
    {
      excludeMemoryId,
    },
  );
}

export async function applyEnrichment(
  memoryId: string,
  tags: string[],
  relatedMemoryIds?: string[],
): Promise<{ applied: boolean }> {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }

  return await client.action(api.memoryApi.applyEnrichment, {
    memoryId,
    tags,
    relatedMemoryIds,
  });
}
