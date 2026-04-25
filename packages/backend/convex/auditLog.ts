import { AuditLog } from "convex-audit-log";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { authQuery } from "./auth";

/**
 * Shared audit-log client for the whole backend.
 *
 * `piiFields` are auto-redacted whenever they appear as keys inside
 * `metadata`, `before`, or `after` payloads passed to `log` / `logChange`.
 * Extend this list if new sensitive field names enter the codebase.
 */
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

/**
 * Stable `resourceType` constants so all callers write the same string.
 * Keep this list short and meaningful — one entry per product surface.
 */
export const ResourceTypes = {
  MEMORY: "memory",
  PROPOSED_UPDATE: "proposed_update",
  API_KEY: "api_key",
  API_REQUEST: "api_request",
  TEAM: "team",
  TEAM_MEMBER: "team_member",
  PROFILE: "profile",
  CONNECTOR: "connector",
} as const;

export type ResourceType = (typeof ResourceTypes)[keyof typeof ResourceTypes];

/**
 * Maps an HTTP status code into an audit-log severity level.
 *   2xx → "info"
 *   4xx → "warning" (client error — possible abuse / bad auth)
 *   5xx → "error"  (server error — investigate)
 *   anything else → "info"
 * Shared so `apiKeys.recordUsageInternal` and the `apiRequestLogs` backfill
 * always produce the same severity for identical status codes.
 */
export function severityForStatus(
  status: number,
): "info" | "warning" | "error" {
  if (status >= 500) return "error";
  if (status >= 400) return "warning";
  return "info";
}

/**
 * Auth-scoped pass-through over the audit-log client: returns every
 * `api_request` entry for the current user, reshaped into the minimal row
 * the settings/usage UI needs. The frontend computes the summary
 * (total / success-rate / avg duration) and formats timestamps itself —
 * this keeps the backend surface small while preserving security
 * (actorId is pinned to `ctx.userId`, never accepted from the caller).
 *
 * The audit-log client returns entries typed as `any` — we narrow each
 * field with a `typeof` check before writing it into the declared shape,
 * and rely on the Convex `returns:` runtime validator as a second gate.
 */
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

    const entries = await auditLog.queryByActor(ctx, {
      actorId: ctx.userId,
      actions: ["api_request"],
      limit,
    });

    const result: {
      _id: string;
      endpoint: string;
      status: number;
      durationMs: number;
      originalTimestamp: number;
    }[] = [];

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const entryId = typeof entry._id === "string" ? entry._id : null;
      if (!entryId) continue;

      const meta = entry.metadata;
      if (!meta || typeof meta !== "object") continue;

      const endpoint = typeof meta.endpoint === "string" ? meta.endpoint : "";
      const status = typeof meta.status === "number" ? meta.status : 0;
      const durationMs =
        typeof meta.durationMs === "number" ? meta.durationMs : 0;
      const originalTimestamp =
        typeof meta.originalTimestamp === "number"
          ? meta.originalTimestamp
          : typeof entry.timestamp === "number"
            ? entry.timestamp
            : 0;

      result.push({
        _id: entryId,
        endpoint,
        status,
        durationMs,
        originalTimestamp,
      });
    }

    return result;
  },
});
