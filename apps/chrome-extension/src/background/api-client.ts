import { getStorage } from "@/lib/storage";
import { API_VERSION } from "@/lib/constants";
import type {
  CreateMemoryParams,
  MemoryWithTags,
  MemoryCandidate,
} from "@/types/api";

async function getBaseUrl(): Promise<string> {
  const { apiUrl } = await getStorage();
  return `${apiUrl}/${API_VERSION}`;
}

async function getUserId(): Promise<string> {
  const { userId } = await getStorage();
  return userId;
}

export async function createMemory(
  params: Omit<CreateMemoryParams, "userId">,
): Promise<MemoryWithTags> {
  const baseUrl = await getBaseUrl();
  const userId = await getUserId();

  const response = await fetch(`${baseUrl}/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, userId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create memory: ${error}`);
  }

  return response.json() as Promise<MemoryWithTags>;
}

export async function retrieveMemories(
  query: string,
  limit = 5,
): Promise<MemoryCandidate[]> {
  const baseUrl = await getBaseUrl();
  const userId = await getUserId();

  const response = await fetch(`${baseUrl}/memories/retrieve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, query, limit }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to retrieve memories: ${error}`);
  }

  const data = (await response.json()) as { memories: MemoryCandidate[] };
  return data.memories;
}

export async function testConnection(): Promise<boolean> {
  const baseUrl = await getBaseUrl();
  const userId = await getUserId();

  const response = await fetch(
    `${baseUrl}/memories?userId=${encodeURIComponent(userId)}&limit=1`,
  );

  return response.ok;
}
