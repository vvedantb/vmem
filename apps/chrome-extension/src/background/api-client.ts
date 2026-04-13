import { getStorage } from "@/lib/storage";
import { CONVEX_URL } from "@/lib/constants";
import type {
  CreateMemoryParams,
  MemoryWithTags,
  MemoryCandidate,
} from "@/types/api";

const API_BASE = `${CONVEX_URL}/api/mcp/memories`;

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
  const headers = await authHeaders();

  const response = await fetch(`${API_BASE}/create`, {
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

  const result = await response.json();
  return { status: "created", memory: result.data };
}

export async function updateMemory(
  memoryId: string,
  params: { title?: string; content?: string; tags?: string[] },
): Promise<MemoryWithTags> {
  const headers = await authHeaders();

  const response = await fetch(`${API_BASE}/update`, {
    method: "POST",
    headers,
    body: JSON.stringify({ memoryId, ...params }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update memory: ${error}`);
  }

  const result = await response.json();
  return result.data;
}

export async function retrieveMemories(
  query: string,
  limit = 5,
): Promise<MemoryCandidate[]> {
  const headers = await authHeaders();

  const response = await fetch(`${API_BASE}/retrieve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, limit }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to retrieve memories: ${error}`);
  }

  const result = await response.json();
  return result.data;
}
