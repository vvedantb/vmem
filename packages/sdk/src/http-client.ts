import { z } from "zod";
import { VMemoryError } from "./errors";
import type { ApiErrorBody } from "./types";

function trimTrailingSlash(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

const apiIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

const apiErrorBodySchema = z.object({
  error: z.string(),
  issues: z.array(apiIssueSchema).optional(),
});

const apiSuccessEnvelopeSchema = z.object({
  data: z.unknown(),
});

const errorOnlyBodySchema = z.object({ error: z.string() });

function parseErrorBody(body: unknown): ApiErrorBody | null {
  const parsed = apiErrorBodySchema.safeParse(body);
  if (!parsed.success) {
    // Accept `{ error }` even when `issues` is malformed.
    const fallback = errorOnlyBodySchema.safeParse(body);
    return fallback.success ? { error: fallback.data.error } : null;
  }
  return parsed.data;
}

function unwrapData(
  json: unknown,
  method: string,
  path: string,
  status: number,
): unknown {
  const parsed = apiSuccessEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    throw new VMemoryError(
      `VMemory API ${method} ${path} returned an invalid response`,
      status,
      "invalid_response",
    );
  }
  return parsed.data.data;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = trimTrailingSlash(baseUrl);
    this.apiKey = apiKey;
  }

  async post(path: string, body: object): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async patch(path: string, body: object): Promise<unknown> {
    return this.request("PATCH", path, body);
  }

  private async request(
    method: "POST" | "PATCH",
    path: string,
    body: object,
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
