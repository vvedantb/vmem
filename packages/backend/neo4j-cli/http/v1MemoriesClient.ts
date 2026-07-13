import { z } from "zod";

export const DEFAULT_HTTP_API_BASE_URL =
  "https://outgoing-reindeer-268.eu-west-1.convex.site";

const errorBodySchema = z.object({
  error: z.string(),
});

const apiEnvelopeSchema = z.object({ data: z.unknown() });

const memoryIdentityFields = {
  id: z.string(),
  title: z.string(),
  content: z.string(),
};

const memorySchema = z
  .object({
    ...memoryIdentityFields,
    type: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

const retrieveDataSchema = z.object({
  memories: z.array(z.object(memoryIdentityFields).passthrough()),
  userContext: z.object({
    aboutMe: z.string().nullable(),
    preferences: z.string().nullable(),
  }),
});

const deleteDataSchema = z.object({
  deleted: z.literal(true),
});

const healthBodySchema = z.object({
  status: z.literal("ok"),
});

const jsonObjectSchema = z.object({}).passthrough();

export type HttpMemory = z.infer<typeof memorySchema>;
export type HttpRetrieveResult = z.infer<typeof retrieveDataSchema>;

export type HttpClientConfig = {
  baseUrl: string;
  apiKey: string;
};

export type HttpJsonResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

async function readJson(response: Response): Promise<object | null> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  try {
    const raw: unknown = JSON.parse(text);
    const parsed = jsonObjectSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function errorResultFromBody(
  status: number,
  body: object,
): { ok: false; status: number; error: string } {
  const error = errorBodySchema.safeParse(body);
  if (error.success) {
    return { ok: false, status, error: error.data.error };
  }
  return { ok: false, status, error: "unexpected_response" };
}

function parseDirect<T>(
  status: number,
  body: object | null,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): HttpJsonResult<T> {
  if (body === null) {
    return { ok: false, status, error: "invalid_json" };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResultFromBody(status, body);
  }
  return { ok: true, status, data: parsed.data };
}

function parseEnvelope<T>(
  status: number,
  body: object | null,
  dataSchema: z.ZodType<T, z.ZodTypeDef, unknown>,
): HttpJsonResult<T> {
  if (body === null) {
    return { ok: false, status, error: "invalid_json" };
  }

  // Parse wrapper first, then data — avoids ZodType<T> making `.data` optional in z.object.
  const envelope = apiEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return errorResultFromBody(status, body);
  }

  const data = dataSchema.safeParse(envelope.data.data);
  if (!data.success) {
    return errorResultFromBody(status, body);
  }
  return { ok: true, status, data: data.data };
}

export function createHttpMemoriesClient(config: HttpClientConfig) {
  const { baseUrl, apiKey } = config;

  async function fetchJson(
    path: string,
    init: RequestInit,
  ): Promise<{ status: number; body: object | null }> {
    const response = await fetch(`${baseUrl}${path}`, init);
    return {
      status: response.status,
      body: await readJson(response),
    };
  }

  async function requestDirect<T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    init: RequestInit,
  ): Promise<HttpJsonResult<T>> {
    const { status, body } = await fetchJson(path, init);
    return parseDirect(status, body, schema);
  }

  async function request<T>(
    path: string,
    dataSchema: z.ZodType<T, z.ZodTypeDef, unknown>,
    init: RequestInit,
    authToken: string | null = apiKey,
  ): Promise<HttpJsonResult<T>> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (authToken !== null) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }

    const { status, body } = await fetchJson(path, { ...init, headers });
    return parseEnvelope(status, body, dataSchema);
  }

  function storeAuthProbe(authToken: string | null, content: string) {
    return request(
      "/api/v1/memories",
      memorySchema,
      {
        method: "POST",
        body: JSON.stringify({
          title: "should fail",
          content,
          type: "note",
          source: "vitest",
          tags: [],
          confidence: 1,
        }),
      },
      authToken,
    );
  }

  return {
    health() {
      return requestDirect("/health", healthBodySchema, { method: "GET" });
    },

    storeStructured(body: {
      title: string;
      content: string;
      type: string;
      source: string;
      tags: string[];
      confidence: number;
      externalId?: string;
      sourceType?: string;
    }) {
      return request("/api/v1/memories", memorySchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    retrieve(body: { query: string; limit?: number }) {
      return request("/api/v1/memories/retrieve", retrieveDataSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    updateStructured(body: {
      memoryId: string;
      title?: string;
      content?: string;
    }) {
      return request("/api/v1/memories", memorySchema, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    deleteStructured(body: { memoryId: string }) {
      return request("/api/v1/memories", deleteDataSchema, {
        method: "DELETE",
        body: JSON.stringify(body),
      });
    },

    storeWithoutAuth() {
      return storeAuthProbe(null, "no auth header");
    },

    storeWithBadKey() {
      return storeAuthProbe("vmem_sk_invalid_key_for_tests", "bad key");
    },

    storeInvalidBody() {
      return request("/api/v1/memories", memorySchema, {
        method: "POST",
        body: JSON.stringify({ title: "missing required fields" }),
      });
    },
  };
}
