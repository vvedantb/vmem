import { httpAction } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { hashApiKey } from "../../apiKeys";
import { extractBearerToken } from "../../lib/bearerToken";
import type { Id } from "../../_generated/dataModel";
import type { z } from "zod";

const API_KEY_PREFIX = "vmem_sk_";

export type ApiKeyAuth = {
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
    { keyHash },
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

export async function assertProfileAccess(
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

export function withApiKeyAuth<T>(
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
    } catch (err) {
      console.error(`[HTTP][${endpoint}]`, err);
      const durationMs = Date.now() - startedAt;
      await recordUsage(ctx, auth, endpoint, method, 500, durationMs);
      return jsonResponse({ error: "internal_error" }, 500);
    }
  });
}
