import { AuditLog } from "convex-audit-log";
import { components } from "./_generated/api";

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
