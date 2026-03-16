type BodyValue = Record<string, string | number | string[] | undefined>;

function getApiUrl(): string {
  const url = process.env.VMEM_API_URL;
  if (!url) {
    throw new Error("VMEM_API_URL environment variable is required");
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

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: BodyValue;
}

async function apiRequest(
  path: string,
  token: string,
  options: RequestOptions,
): Promise<ApiResult> {
  const url = `${getApiUrl()}/v1${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
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
  return apiRequest("/memories/search", token, { method: "POST", body });
}

export function retrieveMemories(
  token: string,
  body: BodyValue,
): Promise<ApiResult> {
  return apiRequest("/memories/retrieve", token, { method: "POST", body });
}

export function addMemory(token: string, body: BodyValue): Promise<ApiResult> {
  return apiRequest("/memories", token, { method: "POST", body });
}

export function updateMemory(
  token: string,
  id: string,
  body: BodyValue,
): Promise<ApiResult> {
  return apiRequest(`/memories/${id}`, token, { method: "PATCH", body });
}

export function deleteMemory(token: string, id: string): Promise<ApiResult> {
  return apiRequest(`/memories/${id}`, token, { method: "DELETE" });
}
