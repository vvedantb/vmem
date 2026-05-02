import { ConvexHttpClient } from "convex/browser";
import { api, type Id } from "@vmem/backend";
import { getStorage } from "@/lib/storage";
import { CONVEX_URL } from "@/lib/constants";
import type {
  CreateMemoryParams,
  MemoryWithTags,
  MemoryCandidate,
  Profile,
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
    profileId: params.profileId,
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

  const result = await client.action(api.memoryApi.retrieveMemories, {
    query,
    limit,
  });
  return result.memories;
}

export async function getMemory(
  memoryId: string,
): Promise<MemoryWithTags | null> {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }

  return await client.action(api.memoryApi.getMemory, { memoryId });
}

/**
 * Upload a screenshot blob to Convex storage and create a memory pointing
 * at it. Three steps:
 *   1. Action `generateMemoryUploadUrl` returns a signed POST URL.
 *   2. POST the PNG bytes to that URL → `{ storageId }`.
 *   3. Action `importImageMemory` attaches the storage object to a new
 *      memory with image-aware metadata (skips text extraction).
 */
export async function saveScreenshot(params: {
  blob: Blob;
  caption?: string;
  pageUrl: string;
  pageTitle: string;
  profileId?: string;
}): Promise<MemoryWithTags> {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }

  console.log(
    "[vmem] saveScreenshot: requesting upload URL, blob size",
    params.blob.size,
  );

  let uploadUrl: string;
  try {
    uploadUrl = await client.action(api.memoryApi.generateMemoryUploadUrl, {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`generateMemoryUploadUrl failed: ${msg}`);
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": params.blob.type || "image/png" },
    body: params.blob,
  });
  if (!uploadRes.ok) {
    throw new Error(
      `Screenshot upload POST failed: ${uploadRes.status} ${uploadRes.statusText}`,
    );
  }
  const uploadJson: { storageId: Id<"_storage"> } = await uploadRes.json();
  console.log("[vmem] saveScreenshot: uploaded", uploadJson.storageId);

  try {
    const memory = await client.action(api.fileImport.importImageMemory, {
      storageId: uploadJson.storageId,
      mimeType: params.blob.type || "image/png",
      caption: params.caption,
      pageUrl: params.pageUrl,
      pageTitle: params.pageTitle,
      profileId: params.profileId,
    });
    console.log("[vmem] saveScreenshot: memory created", memory.id);
    return memory;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Most common failure mode here: the action hasn't been deployed to
    // Convex yet. After editing fileImport.ts, run `npx convex dev` in
    // packages/backend (or `npx convex deploy` for prod).
    throw new Error(`importImageMemory action failed: ${msg}`);
  }
}

export async function listProfiles(): Promise<Profile[]> {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }

  const profiles = await client.query(api.profiles.list, {});
  return profiles.map((p) => ({
    _id: p._id,
    name: p.name,
    color: p.color,
    icon: p.icon,
    isDefault: p.isDefault,
  }));
}

export async function setDefaultProfile(profileId: string): Promise<void> {
  const client = await getAuthenticatedClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }

  await client.mutation(api.userSettings.setDefaultProfile, {
    source: "extension" as const,
    profileId: profileId as Id<"profiles">,
  });
}
