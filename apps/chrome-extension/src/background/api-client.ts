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

async function authHeaders(): Promise<Record<string, string>> {
  const { authToken } = await getStorage();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
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
  const baseUrl = await getBaseUrl();
  const headers = await authHeaders();

  const response = await fetch(`${baseUrl}/memories`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (response.status === 409) {
    const data: { existingMemory: DuplicateInfo } = await response.json();
    return { status: "duplicate", existingMemory: data.existingMemory };
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create memory: ${error}`);
  }

  const memory: MemoryWithTags = await response.json();
  return { status: "created", memory };
}

export async function updateMemory(
  memoryId: string,
  params: { title?: string; content?: string; tags?: string[] },
): Promise<MemoryWithTags> {
  const baseUrl = await getBaseUrl();
  const headers = await authHeaders();

  const response = await fetch(`${baseUrl}/memories/${memoryId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update memory: ${error}`);
  }

  const memory: MemoryWithTags = await response.json();
  return memory;
}

export async function retrieveMemories(
  query: string,
  limit = 5,
): Promise<MemoryCandidate[]> {
  const baseUrl = await getBaseUrl();
  const headers = await authHeaders();

  const response = await fetch(`${baseUrl}/memories/retrieve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, limit }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to retrieve memories: ${error}`);
  }

  const data: { memories: MemoryCandidate[] } = await response.json();
  return data.memories;
}

export async function testConnection(): Promise<boolean> {
  const baseUrl = await getBaseUrl();
  const headers = await authHeaders();

  const response = await fetch(`${baseUrl}/memories?limit=1`, { headers });

  return response.ok;
}
