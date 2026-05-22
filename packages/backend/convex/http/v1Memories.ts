import { httpAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { hashApiKey } from "../apiKeys";
import type { Id } from "../_generated/dataModel";
import { z } from "zod";

const API_KEY_PREFIX = "vmem_sk_";

const storeBodySchema = z.object({
  title: z.string(),
  content: z.string(),
  type: z.string(),
  source: z.string(),
  tags: z.array(z.string()),
  confidence: z.number(),
  expiresAt: z.string().optional(),
  url: z.string().optional(),
  profileId: z.string().optional(),
  externalId: z.string().optional(),
  sourceType: z.string().optional(),
});

const retrieveBodySchema = z.object({
  query: z.string(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().positive().default(10),
  profileId: z.string().optional(),
});

const updateBodySchema = z.object({
  memoryId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().optional(),
  expiresAt: z.union([z.string(), z.null()]).optional(),
});

type ApiKeyAuth = {
  userId: Id<"users">;
  clerkId: string;
  keyHash: string;
};

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function unauthorized(): Response {
  return jsonResponse({ error: "unauthorized" }, 401);
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2) return null;
  if (parts[0]?.toLowerCase() !== "bearer") return null;
  return parts[1] ?? null;
}

async function resolveApiKeyAuth(
  ctx: ActionCtx,
  rawToken: string,
): Promise<ApiKeyAuth | null> {
  if (!rawToken.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const keyHash = await hashApiKey(rawToken);
  const resolved = await ctx.runQuery(
    internal.apiKeys.resolveByKeyHashInternal,
    {
      keyHash,
    },
  );

  if (!resolved) {
    return null;
  }

  return {
    userId: resolved.userId,
    clerkId: resolved.clerkId,
    keyHash,
  };
}

async function assertProfileAccess(
  ctx: ActionCtx,
  userId: Id<"users">,
  profileId: string,
): Promise<Response | null> {
  try {
    await ctx.runQuery(internal.teams.assertProfileAccessInternal, {
      profileId,
      userId,
    });
    return null;
  } catch {
    return jsonResponse({ error: "forbidden" }, 403);
  }
}

async function recordUsage(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  endpoint: string,
  method: string,
  status: number,
  durationMs: number,
): Promise<void> {
  await ctx.runMutation(internal.apiKeys.recordUsageInternal, {
    keyHash: auth.keyHash,
    endpoint,
    method,
    status,
    durationMs,
    createdAt: Date.now(),
  });
}

function withApiKeyAuth<T>(
  endpoint: string,
  method: string,
  schema: z.ZodType<T>,
  run: (
    ctx: ActionCtx,
    auth: ApiKeyAuth,
    body: T,
  ) => Promise<unknown | Response>,
) {
  return httpAction(async (ctx, req) => {
    const startedAt = Date.now();

    const token = extractBearerToken(req.headers.get("Authorization"));
    if (!token) {
      return unauthorized();
    }

    const auth = await resolveApiKeyAuth(ctx, token);
    if (!auth) {
      return unauthorized();
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      const durationMs = Date.now() - startedAt;
      await recordUsage(ctx, auth, endpoint, method, 400, durationMs);
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const durationMs = Date.now() - startedAt;
      await recordUsage(ctx, auth, endpoint, method, 400, durationMs);
      return jsonResponse(
        { error: "invalid_request", issues: parsed.error.issues },
        400,
      );
    }

    try {
      const result = await run(ctx, auth, parsed.data);
      const durationMs = Date.now() - startedAt;

      if (result instanceof Response) {
        await recordUsage(
          ctx,
          auth,
          endpoint,
          method,
          result.status,
          durationMs,
        );
        return result;
      }

      await recordUsage(ctx, auth, endpoint, method, 200, durationMs);
      return jsonResponse({ data: result }, 200);
    } catch {
      const durationMs = Date.now() - startedAt;
      await recordUsage(ctx, auth, endpoint, method, 500, durationMs);
      return jsonResponse({ error: "internal_error" }, 500);
    }
  });
}

export const storeMemory = withApiKeyAuth(
  "/api/v1/memories",
  "POST",
  storeBodySchema,
  async (ctx, auth, body) => {
    if (body.profileId) {
      const forbidden = await assertProfileAccess(
        ctx,
        auth.userId,
        body.profileId,
      );
      if (forbidden) {
        return forbidden;
      }
    }

    return await ctx.runAction(
      internal.neo4jActions.memories.createMemoryInternal,
      {
        clerkId: auth.clerkId,
        profileId: body.profileId,
        title: body.title,
        content: body.content,
        type: body.type,
        source: body.source,
        tags: body.tags,
        confidence: body.confidence,
        expiresAt: body.expiresAt,
        url: body.url,
        externalId: body.externalId,
        sourceType: body.sourceType,
      },
    );
  },
);

export const retrieveMemories = withApiKeyAuth(
  "/api/v1/memories/retrieve",
  "POST",
  retrieveBodySchema,
  async (ctx, auth, body) => {
    if (body.profileId) {
      const forbidden = await assertProfileAccess(
        ctx,
        auth.userId,
        body.profileId,
      );
      if (forbidden) {
        return forbidden;
      }
    }

    return await ctx.runAction(
      internal.neo4jActions.memories.retrieveMemoriesInternal,
      {
        clerkId: auth.clerkId,
        profileId: body.profileId,
        query: body.query,
        type: body.type,
        tags: body.tags,
        limit: body.limit,
      },
    );
  },
);

export const updateMemory = withApiKeyAuth(
  "/api/v1/memories",
  "PATCH",
  updateBodySchema,
  async (ctx, auth, body) => {
    return await ctx.runAction(
      internal.neo4jActions.memories.updateMemoryInternal,
      {
        clerkId: auth.clerkId,
        memoryId: body.memoryId,
        title: body.title,
        content: body.content,
        type: body.type,
        status: body.status,
        tags: body.tags,
        confidence: body.confidence,
        expiresAt: body.expiresAt,
      },
    );
  },
);
