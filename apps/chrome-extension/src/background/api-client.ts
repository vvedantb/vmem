import { createClerkClient } from "@clerk/chrome-extension/client";
import { getStorage } from "@/lib/storage";
import { API_VERSION, CLERK_PUBLISHABLE_KEY } from "@/lib/constants";
import type {
  CreateMemoryParams,
  MemoryWithTags,
  MemoryCandidate,
} from "@/types/api";

async function getBaseUrl(): Promise<string> {
  const { apiUrl } = await getStorage();
  return `${apiUrl}/${API_VERSION}`;
}

async function getAuthToken(): Promise<string | null> {
  const clerk = await createClerkClient({
    publishableKey: CLERK_PUBLISHABLE_KEY,
    background: true,
  });

  if (!clerk.session) {
    return null;
  }

  return clerk.session.getToken();
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function createMemory(
  params: CreateMemoryParams,
): Promise<MemoryWithTags> {
  const baseUrl = await getBaseUrl();
  const headers = await authHeaders();

  const response = await fetch(`${baseUrl}/memories`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
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

  const data = (await response.json()) as { memories: MemoryCandidate[] };
  return data.memories;
}

export async function testConnection(): Promise<boolean> {
  const baseUrl = await getBaseUrl();
  const headers = await authHeaders();

  const response = await fetch(`${baseUrl}/memories?limit=1`, { headers });

  return response.ok;
}
