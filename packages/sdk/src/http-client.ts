import { VMemoryError } from "./errors";
import type { ApiErrorBody } from "./types";

function trimTrailingSlash(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function parseErrorBody(body: unknown): ApiErrorBody | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const errorField = Reflect.get(body, "error");
  if (typeof errorField !== "string") {
    return null;
  }
  const issuesField = Reflect.get(body, "issues");
  if (issuesField === undefined) {
    return { error: errorField };
  }
  if (!Array.isArray(issuesField)) {
    return { error: errorField };
  }
  return { error: errorField, issues: issuesField };
}

function unwrapData(
  json: unknown,
  method: string,
  path: string,
  status: number,
): unknown {
  if (typeof json !== "object" || json === null) {
    throw new VMemoryError(
      `VMemory API ${method} ${path} returned an invalid response`,
      status,
      "invalid_response",
    );
  }

  if (!("data" in json)) {
    throw new VMemoryError(
      `VMemory API ${method} ${path} returned an invalid response`,
      status,
      "invalid_response",
    );
  }

  return Reflect.get(json, "data");
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = trimTrailingSlash(baseUrl);
    this.apiKey = apiKey;
  }

  async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async patch(path: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request("PATCH", path, body);
  }

  private async request(
    method: "POST" | "PATCH",
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const parsed = parseErrorBody(json);
      const code = parsed?.error ?? "request_failed";
      throw new VMemoryError(
        `VMemory API ${method} ${path} failed (${String(response.status)}): ${code}`,
        response.status,
        code,
        parsed?.issues,
      );
    }

    return unwrapData(json, method, path, response.status);
  }
}
