import { httpAction, type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { hashApiKey } from "../../apiKeys";
import { extractBearerToken } from "@vvedantb/server/convex";
import type { Id } from "../../_generated/dataModel";
import { getAccessibleProfileForUser } from "../../profiles/accessibleProfile";
import type { z } from "zod";
import { resolveBearerAuth } from "./bearerToken";

export type ApiKeyAuth = {
  userId: Id<"users">;
  clerkId: string;
  // Set only for API keys. Clerk OAuth tokens have no key to account usage to.
  keyHash?: string;
};

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

async function resolveApiKeyAuth(
  ctx: ActionCtx,
  rawToken: string,
): Promise<ApiKeyAuth | null> {
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

async function resolveClerkAuth(
  ctx: ActionCtx,
  token: string,
): Promise<ApiKeyAuth | null> {
  const verified = await ctx.runAction(
    internal.mcp.nodeActions.verifyAccessToken,
    { token },
  );
  if (!verified) {
    return null;
  }
  const { clerkUserId } = verified;
  const existing = await ctx.runQuery(
    internal.auth.getUserIdByClerkIdInternal,
    {
      clerkId: clerkUserId,
    },
  );
  if (existing) {
    return { userId: existing, clerkId: clerkUserId };
  }
  // First request from this account: HTTP has no Convex identity, so create the
  // same user and Personal profile that ensureUserExists makes.
  const profile = await ctx.runAction(
    internal.mcp.nodeActions.fetchClerkUserProfile,
    { clerkUserId },
  );
  const created = await ctx.runMutation(
    internal.auth.ensureUserForClerkIdInternal,
    { clerkId: clerkUserId, ...profile },
  );
  return { userId: created.userId, clerkId: clerkUserId };
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

    const auth = await resolveBearerAuth(token, {
      apiKey: (key) => resolveApiKeyAuth(ctx, key),
      clerk: (jwt) => resolveClerkAuth(ctx, jwt),
    });
    if (!auth) {
      return unauthorized();
    }

    const respond = async (response: Response): Promise<Response> => {
      if (auth.keyHash === undefined) {
        return response;
      }
      try {
        await ctx.runMutation(internal.apiKeys.recordUsageInternal, {
          keyHash: auth.keyHash,
          endpoint,
          method,
          status: response.status,
          durationMs: Date.now() - startedAt,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.error(`[HTTP][${endpoint}] recordUsage failed`, err);
      }
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
