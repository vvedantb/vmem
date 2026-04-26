type BodyValue = Record<string, string | number | string[] | undefined>;

function getApiUrl(): string {
  const url = process.env.VMEM_CONVEX_SITE_URL;
  if (!url) {
    throw new Error("VMEM_CONVEX_SITE_URL environment variable is required");
  }
  return url.replace(/\/$/, "");
}

interface ApiSuccess {
  ok: true;
  text: string;
}

interface ApiFailure {
  ok: false;
  status: number;
  message: string;
}

type ApiResult = ApiSuccess | ApiFailure;

async function apiRequest(
  path: string,
  token: string,
  body?: BodyValue,
): Promise<ApiResult> {
  const url = `${getApiUrl()}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : JSON.stringify({}),
  });

  const text = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: text,
    };
  }

  return { ok: true, text };
}

export function searchMemories(
  token: string,
  body: BodyValue,
): Promise<ApiResult> {
  return apiRequest("/api/mcp/memories/search", token, body);
}

export function retrieveMemories(
  token: string,
  body: BodyValue,
): Promise<ApiResult> {
  return apiRequest("/api/mcp/memories/retrieve", token, body);
}

export function addMemory(token: string, body: BodyValue): Promise<ApiResult> {
  return apiRequest("/api/mcp/memories/create", token, body);
}

export function updateMemory(
  token: string,
  id: string,
  body: BodyValue,
): Promise<ApiResult> {
  return apiRequest("/api/mcp/memories/update", token, {
    ...body,
    memoryId: id,
  });
}

export function deleteMemory(token: string, id: string): Promise<ApiResult> {
  return apiRequest("/api/mcp/memories/delete", token, { memoryId: id });
}

export function listSkills(token: string): Promise<ApiResult> {
  return apiRequest("/api/mcp/skills/list", token);
}

export function getSkill(token: string, name: string): Promise<ApiResult> {
  return apiRequest("/api/mcp/skills/get", token, { name });
}

export function whoami(token: string): Promise<ApiResult> {
  return apiRequest("/api/mcp/whoami", token);
}

export function listProfiles(token: string): Promise<ApiResult> {
  return apiRequest("/api/mcp/profiles/list", token);
}

export function getActiveProfile(token: string): Promise<ApiResult> {
  return apiRequest("/api/mcp/profiles/active", token);
}

export function getContextPrompt(token: string): Promise<ApiResult> {
  return apiRequest("/api/mcp/context-prompt", token);
}
