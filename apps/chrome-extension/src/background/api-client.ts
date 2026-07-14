import { api, type Id } from "@vmem/backend";
import type { FunctionArgs } from "convex/server";
import type { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { createAuthenticatedConvexClient } from "./auth";
import type {
  CreateMemoryParams,
  MemoryWithTags,
  MemoryCandidate,
  Profile,
} from "@/types/api";

// userSettings.update args — from the convex validator
export type UserSettingsUpdateArgs = FunctionArgs<
  typeof api.userSettings.update
>;

const uploadResponseSchema = z.object({
  storageId: z.custom<Id<"_storage">>(
    (v) => typeof v === "string" && v.length > 0,
  ),
});

async function requireAuthenticatedClient(): Promise<ConvexHttpClient> {
  const client = await createAuthenticatedConvexClient();
  if (!client) {
    throw new Error(
      "Not authenticated - please sign in via the extension popup",
    );
  }
  return client;
}

export async function createMemory(
  params: CreateMemoryParams,
): Promise<MemoryWithTags> {
  const client = await requireAuthenticatedClient();

  return await client.action(api.memoryApi.createMemory, {
    title: params.title,
    content: params.content,
    type: params.type,
    source: params.source,
    tags: params.tags,
    confidence: params.confidence,
    url: params.url,
    profileId: params.profileId,
  });
}

export async function retrieveMemories(
  query: string,
  limit = 5,
): Promise<MemoryCandidate[]> {
  const client = await requireAuthenticatedClient();

  const result = await client.action(api.memoryApi.retrieveMemories, {
    query,
    limit,
  });
  return result.memories;
}

// upload screenshot → storage → importImageMemory
export async function saveScreenshot(params: {
  blob: Blob;
  caption?: string;
  pageUrl: string;
  pageTitle: string;
  profileId?: string;
}): Promise<MemoryWithTags> {
  const client = await requireAuthenticatedClient();

  console.log(
    "[vmem] saveScreenshot: requesting upload URL, blob size",
    params.blob.size,
  );

  let uploadUrl: string;
  try {
    uploadUrl = await client.mutation(
      api.memoryApi.generateMemoryUploadUrl,
      {},
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`generateMemoryUploadUrl failed: ${msg}`, { cause: err });
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
  const uploadRaw: unknown = await uploadRes.json();
  const uploadParsed = uploadResponseSchema.safeParse(uploadRaw);
  if (!uploadParsed.success) {
    throw new Error("Screenshot upload returned invalid JSON");
  }
  const storageId: Id<"_storage"> = uploadParsed.data.storageId;
  console.log("[vmem] saveScreenshot: uploaded", storageId);

  try {
    const memory = await client.action(api.fileImport.importImageMemory, {
      storageId,
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
    // often means importImageMemory isn't deployed yet
    throw new Error(`importImageMemory action failed: ${msg}`, { cause: err });
  }
}

export async function listProfiles(): Promise<Profile[]> {
  const client = await requireAuthenticatedClient();

  const profiles = await client.query(api.profiles.list, {});
  return profiles.map(
    (p): Profile => ({
      _id: p._id,
      name: p.name,
      color: p.color,
      icon: p.icon,
      isDefault: p.isDefault,
    }),
  );
}

// durable settings write via http — popup websocket can drop on close
export async function updateUserSettings(
  args: UserSettingsUpdateArgs,
): Promise<void> {
  const client = await requireAuthenticatedClient();

  await client.mutation(api.userSettings.update, args);
}
