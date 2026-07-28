import { httpAction, type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { hashApiKey } from "../../apiKeys";
import { extractBearerToken } from "../../lib/bearerToken";
import type { Id } from "../../_generated/dataModel";
import { getAccessibleProfileForUser } from "../../profiles/accessibleProfile";
import type { z } from "zod";

const API_KEY_PREFIX = "vmem_sk_";

export type ApiKeyAuth = {
  userId: Id<"users">;
  clerkId: string;
  keyHash: string;
};

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
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

// checks profile access only when a profileId is present. no-op otherwise
export async function guardProfileAccess(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  profileId: string | undefined,
): Promise<Response | null> {
  if (!profileId) {
    return null;
  }
  try {
    await getAccessibleProfileForUser(ctx, auth.userId, profileId);
    return null;
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
}

export function withApiKeyAuth<T>(
  endpoint: string,
  method: string,
  schema: z.ZodType<T>,
  run: (ctx: ActionCtx, auth: ApiKeyAuth, body: T) => Promise<unknown>,
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

    const respond = async (response: Response): Promise<Response> => {
      await ctx.runMutation(internal.apiKeys.recordUsageInternal, {
        keyHash: auth.keyHash,
        endpoint,
        method,
        status: response.status,
        durationMs: Date.now() - startedAt,
        createdAt: Date.now(),
      });
      return response;
    };

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return respond(Response.json({ error: "invalid_json" }, { status: 400 }));
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return respond(
        Response.json(
          { error: "invalid_request", issues: parsed.error.issues },
          { status: 400 },
        ),
      );
    }

    try {
      const result = await run(ctx, auth, parsed.data);

      if (result instanceof Response) {
        return respond(result);
      }

      return respond(Response.json({ data: result }, { status: 200 }));
    } catch (err) {
      console.error(`[HTTP][${endpoint}]`, err);
      return respond(
        Response.json({ error: "internal_error" }, { status: 500 }),
      );
    }
  });
}
