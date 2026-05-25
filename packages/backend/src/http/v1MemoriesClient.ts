import { z } from "zod";

export const DEFAULT_HTTP_API_BASE_URL =
  "https://outgoing-reindeer-268.eu-west-1.convex.site";

const errorBodySchema = z.object({
  error: z.string(),
});

const memorySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    type: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

const storeDataSchema = memorySchema;

const retrieveMemoriesSchema = z.array(
  z
    .object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
    })
    .passthrough(),
);

const retrieveDataSchema = z.object({
  memories: retrieveMemoriesSchema,
  userContext: z.object({
    aboutMe: z.string().nullable(),
    preferences: z.string().nullable(),
  }),
});

const healthBodySchema = z.object({
  status: z.literal("ok"),
});

function envelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({ data: dataSchema });
}

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
    const parsed: object = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

function parseDirect<T>(
  status: number,
  body: object | null,
  schema: z.ZodType<T>,
): HttpJsonResult<T> {
  if (body === null) {
    return { ok: false, status, error: "invalid_json" };
  }

  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return { ok: true, status, data: parsed.data };
  }

  const error = errorBodySchema.safeParse(body);
  if (error.success) {
    return { ok: false, status, error: error.data.error };
  }

  return { ok: false, status, error: "unexpected_response" };
}

function parseEnvelope<T>(
  status: number,
  body: object | null,
  dataSchema: z.ZodType<T>,
): HttpJsonResult<T> {
  if (body === null) {
    return { ok: false, status, error: "invalid_json" };
  }

  const envelope = envelopeSchema(dataSchema).safeParse(body);
  if (envelope.success) {
    return { ok: true, status, data: envelope.data.data };
  }

  const error = errorBodySchema.safeParse(body);
  if (error.success) {
    return { ok: false, status, error: error.data.error };
  }

  return { ok: false, status, error: "unexpected_response" };
}

export function createHttpMemoriesClient(config: HttpClientConfig) {
  const { baseUrl, apiKey } = config;

  async function requestDirect<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit,
  ): Promise<HttpJsonResult<T>> {
    const response = await fetch(`${baseUrl}${path}`, init);
    const body = await readJson(response);
    return parseDirect(response.status, body, schema);
  }

  async function request<T>(
    path: string,
    dataSchema: z.ZodType<T>,
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

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    const body = await readJson(response);
    return parseEnvelope(response.status, body, dataSchema);
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
      return request("/api/v1/memories", storeDataSchema, {
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
      return request("/api/v1/memories", storeDataSchema, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    storeWithoutAuth() {
      return request(
        "/api/v1/memories",
        storeDataSchema,
        {
          method: "POST",
          body: JSON.stringify({
            title: "should fail",
            content: "no auth header",
            type: "note",
            source: "vitest",
            tags: [],
            confidence: 1,
          }),
        },
        null,
      );
    },

    storeWithBadKey() {
      return request(
        "/api/v1/memories",
        storeDataSchema,
        {
          method: "POST",
          body: JSON.stringify({
            title: "should fail",
            content: "bad key",
            type: "note",
            source: "vitest",
            tags: [],
            confidence: 1,
          }),
        },
        "vmem_sk_invalid_key_for_tests",
      );
    },

    storeInvalidBody() {
      return request("/api/v1/memories", storeDataSchema, {
        method: "POST",
        body: JSON.stringify({ title: "missing required fields" }),
      });
    },
  };
}
