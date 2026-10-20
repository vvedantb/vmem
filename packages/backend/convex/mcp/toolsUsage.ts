import { z } from "zod";
import { internal } from "../_generated/api";
import { openRouterFeatureSchema } from "../lib/openRouter/schemas";
import { emptyInputSchema, scopedClerk, toolSpec } from "./toolTypes";

// AI usage is personal on /mcp and the active team's usage on /mcp/team.

const SCOPE_NOTE =
  "Personal usage on the personal connector; the active team profile's usage on the team connector.";

const rangeParam = z.enum(["today", "7d", "30d", "all"]);

const usageAiLogsSchema = z.object({
  profileId: z
    .string()
    .optional()
    .describe("Only calls made for this profile (from list_profiles)"),
  features: z
    .array(openRouterFeatureSchema)
    .optional()
    .describe("Only these features (any of them)"),
  models: z
    .array(z.string())
    .optional()
    .describe("Only these model ids (from usage_ai_models)"),
  range: rangeParam
    .optional()
    .describe("Time window: today (last 24 h), 7d, 30d or all (default all)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size, 1-100 (default 50, as on the web)"),
  cursor: z.string().optional().describe("nextCursor from the previous page"),
});

const usageAiSummarySchema = z.object({
  range: rangeParam
    .optional()
    .describe("Time window: today (default), 7d, 30d or all"),
});

const usageApiRequestsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Newest entries to return, 1-1000 (default 1000)"),
});

const DEFAULT_LOG_PAGE_SIZE = 50;

export const usageToolSpecs = {
  usage_ai_logs: toolSpec({
    name: "usage_ai_logs",
    schema: usageAiLogsSchema,
    description: `List AI model calls vmem made for you, newest first (the web AI usage log): feature, model, tokens, costUsd, errorMessage and prompt / completion previews. Paginated: pass nextCursor back as cursor while isDone is false. ${SCOPE_NOTE}`,
    errorLabel: "List AI usage failed",
    async run(h, params): Promise<unknown> {
      const { limit, cursor, ...filters } = params;
      const page = await h.ctx.runQuery(
        internal.openRouterLogs.listByClerkIdInternal,
        {
          ...scopedClerk(h),
          ...filters,
          paginationOpts: {
            numItems: limit ?? DEFAULT_LOG_PAGE_SIZE,
            cursor: cursor ?? null,
          },
        },
      );
      return {
        logs: page.page.map(
          ({ _id, _creationTime, aggregatePending: _pending, ...row }) => ({
            id: _id,
            ...row,
            createdAt: new Date(row.createdAt).toISOString(),
          }),
        ),
        isDone: page.isDone,
        nextCursor: page.isDone ? null : page.continueCursor,
      };
    },
  }),
  usage_ai_summary: toolSpec({
    name: "usage_ai_summary",
    schema: usageAiSummarySchema,
    description: `Total AI calls, cost in USD and tokens for a time window (the web usage summary cards). ${SCOPE_NOTE}`,
    errorLabel: "AI usage summary failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runQuery(internal.openRouterLogs.summaryByClerkIdInternal, {
        ...scopedClerk(h),
        range: params.range,
      });
    },
  }),
  usage_ai_models: toolSpec({
    name: "usage_ai_models",
    schema: emptyInputSchema,
    description: `List the distinct model ids in your AI usage log, for the usage_ai_logs models filter. ${SCOPE_NOTE}`,
    errorLabel: "List AI usage models failed",
    async run(h): Promise<unknown> {
      return h.ctx.runQuery(
        internal.openRouterLogs.distinctModelsByClerkIdInternal,
        scopedClerk(h),
      );
    },
  }),
  usage_api_requests: toolSpec({
    name: "usage_api_requests",
    schema: usageApiRequestsSchema,
    description:
      "List your recent HTTP API requests made with vmem API keys, newest first (the web API usage panel): endpoint, status, durationMs and timestamp.",
    errorLabel: "List API requests failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      const rows = await h.ctx.runQuery(
        internal.auditLog.listApiRequestEntriesByClerkIdInternal,
        { clerkId: h.clerkUserId, limit: params.limit },
      );
      return rows.map((row) => ({
        id: row._id,
        endpoint: row.endpoint,
        status: row.status,
        durationMs: row.durationMs,
        timestamp: new Date(row.originalTimestamp).toISOString(),
      }));
    },
  }),
};
