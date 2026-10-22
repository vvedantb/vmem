import { AuditLog } from "convex-audit-log";
import { v, type Infer } from "convex/values";
import { z } from "zod";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { authQuery } from "./auth";
import { getUserIdByClerkId } from "./lib/clerkUser";

const apiRequestMetadataSchema = z.object({
  endpoint: z.string().optional(),
  status: z.number().optional(),
  durationMs: z.number().optional(),
  originalTimestamp: z.number().optional(),
});

const apiRequestEntrySchema = z.object({
  _id: z.string(),
  metadata: apiRequestMetadataSchema,
  timestamp: z.number().optional(),
});

// shared audit log client for the whole backend
export const auditLog = new AuditLog(components.auditLog, {
  piiFields: [
    "email",
    "phone",
    "accesstoken",
    "refreshtoken",
    "encryptedkey",
    "encryptedaccesstoken",
    "encryptedrefreshtoken",
    "hashedkey",
    "keyprefix",
  ],
});

// stable resourceType constants so all callers write the same string
export const ResourceTypes = {
  MEMORY: "memory",
  PROPOSED_UPDATE: "proposed_update",
  API_KEY: "api_key",
  // kept forever: the component cleanup cannot scope to one action (docs environment.mdx)
  API_REQUEST: "api_request",
  TEAM: "team",
  TEAM_MEMBER: "team_member",
  PROFILE: "profile",
  CONNECTOR: "connector",
  USER: "user",
} as const;

// 2xx to info, 4xx to warning, 5xx to error
export function severityForStatus(
  status: number,
): "info" | "warning" | "error" {
  if (status >= 500) return "error";
  if (status >= 400) return "warning";
  return "info";
}

const apiRequestEntryValidator = v.object({
  _id: v.string(),
  endpoint: v.string(),
  status: v.number(),
  durationMs: v.number(),
  originalTimestamp: v.number(),
});

// newest API request entries for one actor, 1-1000 (default 1000)
async function listApiRequestEntries(
  ctx: QueryCtx,
  userId: Id<"users">,
  rawLimit: number | undefined,
): Promise<Array<Infer<typeof apiRequestEntryValidator>>> {
  const limit =
    rawLimit !== undefined && Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(1000, Math.trunc(rawLimit)))
      : 1000;

  const rawEntries: unknown = await auditLog.queryByActor(ctx, {
    actorId: userId,
    actions: ["api_request"],
    limit,
  });
  if (!Array.isArray(rawEntries)) return [];

  const result = [];
  for (const rawEntry of rawEntries) {
    const parsed = apiRequestEntrySchema.safeParse(rawEntry);
    if (!parsed.success) continue;

    const { _id, metadata, timestamp } = parsed.data;
    result.push({
      _id,
      endpoint: metadata.endpoint ?? "",
      status: metadata.status ?? 0,
      durationMs: metadata.durationMs ?? 0,
      originalTimestamp: metadata.originalTimestamp ?? timestamp ?? 0,
    });
  }

  return result;
}

export const listMyApiRequestEntries = authQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(apiRequestEntryValidator),
  handler: async (ctx, args) =>
    listApiRequestEntries(ctx, ctx.userId, args.limit),
});

// MCP usage_api_requests
export const listApiRequestEntriesByClerkIdInternal = internalQuery({
  args: { clerkId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(apiRequestEntryValidator),
  handler: async (ctx, args) =>
    listApiRequestEntries(
      ctx,
      await getUserIdByClerkId(ctx, args.clerkId),
      args.limit,
    ),
});
