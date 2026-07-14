import { AuditLog } from "convex-audit-log";
import { v } from "convex/values";
import { z } from "zod";
import { components } from "./_generated/api";
import { authQuery } from "./auth";

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

// shared audit-log client for the whole backend
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

// stable `resourceType` constants so all callers write the same string
export const ResourceTypes = {
  MEMORY: "memory",
  PROPOSED_UPDATE: "proposed_update",
  API_KEY: "api_key",
  API_REQUEST: "api_request",
  TEAM: "team",
  TEAM_MEMBER: "team_member",
  PROFILE: "profile",
  CONNECTOR: "connector",
  USER: "user",
} as const;

// 2xx → info, 4xx → warning, 5xx → error
export function severityForStatus(
  status: number,
): "info" | "warning" | "error" {
  if (status >= 500) return "error";
  if (status >= 400) return "warning";
  return "info";
}

export const listMyApiRequestEntries = authQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.string(),
      endpoint: v.string(),
      status: v.number(),
      durationMs: v.number(),
      originalTimestamp: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rawLimit = args.limit;
    const limit =
      rawLimit !== undefined && Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(1000, Math.trunc(rawLimit)))
        : 1000;

    const rawEntries: unknown = await auditLog.queryByActor(ctx, {
      actorId: ctx.userId,
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
  },
});
