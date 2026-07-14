import { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { toolSpec } from "./toolTypes";

const codebaseSymbolKindSchema = z.enum([
  "code-file",
  "code-function",
  "code-class",
  "code-interface",
  "code-process",
]);

const codebaseImpactDirectionSchema = z.enum(["upstream", "downstream"]);

const codebasesListSchema = z.object({});

const codebaseOverviewSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
});

const codebaseSearchSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
  query: z.string().describe("Search text (name, path, or qualified name)"),
  kind: codebaseSymbolKindSchema
    .optional()
    .describe("Optional symbol kind filter"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max results (default 20)"),
});

const codebaseContextSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
  symbolId: z
    .string()
    .describe("Symbol id from codebase_search or codebase_graph"),
});

const codebaseImpactSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
  symbolId: z.string().describe("Starting symbol id"),
  direction: codebaseImpactDirectionSchema.describe(
    "upstream = who calls this symbol; downstream = what this symbol calls",
  ),
  depth: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe("Hop depth (default 3)"),
});

const codebaseGraphSchema = z.object({
  codebaseId: z.string().describe("Codebase ID from codebases_list"),
  kinds: z
    .array(codebaseSymbolKindSchema)
    .optional()
    .describe("Limit node kinds in the payload"),
  processId: z
    .string()
    .optional()
    .describe("Return only nodes/edges for one process"),
  blastRadiusOf: z
    .string()
    .optional()
    .describe("Center the graph on this symbol's blast radius"),
  blastDirection: codebaseImpactDirectionSchema
    .optional()
    .describe("Direction when blastRadiusOf is set"),
  blastDepth: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe("Hop depth when blastRadiusOf is set (default 2)"),
});

function mapCodebaseSummary(row: Doc<"codebases">) {
  return {
    id: row._id,
    repoFullName: row.repoFullName,
    repoOwner: row.repoOwner,
    repoName: row.repoName,
    defaultBranch: row.defaultBranch,
    status: row.status,
    language: row.language,
    description: row.description,
    isPrivate: row.isPrivate,
    totalFiles: row.totalFiles,
    syncedFiles: row.syncedFiles,
    lastSyncedAt: row.lastSyncedAt,
    functionCount: row.functionCount,
    classCount: row.classCount,
    interfaceCount: row.interfaceCount,
    callEdgeCount: row.callEdgeCount,
    processCount: row.processCount,
    parserVersion: row.parserVersion,
    lastParseError: row.lastParseError,
    errorMessage: row.errorMessage,
  };
}

export const codebasesToolSpecs = {
  codebases_list: toolSpec({
    name: "codebases_list",
    schema: codebasesListSchema,
    description:
      "List GitHub repositories connected to vmem. Returns codebase IDs, repo names, sync status, and parser stats. Call this first to discover codebaseId values for the other codebase_* tools. Only repos with status 'synced' have graph data in Neo4j.",
    errorLabel: "List codebases failed",
    scopes: ["personal"],
    async run(h): Promise<unknown> {
      const user = await h.ctx.runQuery(internal.users.getByClerkIdInternal, {
        clerkId: h.clerkUserId,
      });
      if (!user) {
        throw new Error("User not found");
      }

      const rows = await h.ctx.runQuery(internal.codebases.listMyInternal, {
        userId: user._id,
      });
      return rows.map(mapCodebaseSummary);
    },
  }),
  codebase_overview: toolSpec({
    name: "codebase_overview",
    schema: codebaseOverviewSchema,
    description:
      "Get aggregate stats for a synced codebase: file, function, class, interface, and process counts plus CALLS and IMPORTS edge counts.",
    errorLabel: "Codebase overview failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return h.ctx.runAction(internal.mcp.codebases.mcpGetCodebaseOverview, {
        clerkId: h.clerkUserId,
        codebaseId: params.codebaseId,
      });
    },
  }),
  codebase_search: toolSpec({
    name: "codebase_search",
    schema: codebaseSearchSchema,
    description:
      "Search symbols (files, functions, classes, interfaces, processes) inside a synced codebase. Use the returned symbol id with codebase_context or codebase_impact.",
    errorLabel: "Codebase search failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return h.ctx.runAction(internal.mcp.codebases.mcpSearchCodebaseSymbols, {
        clerkId: h.clerkUserId,
        codebaseId: params.codebaseId,
        query: params.query,
        kind: params.kind,
        limit: params.limit,
      });
    },
  }),
  codebase_context: toolSpec({
    name: "codebase_context",
    schema: codebaseContextSchema,
    description:
      "Get a symbol's metadata plus its direct CALLS relationships (callers and callees) and linked processes.",
    errorLabel: "Codebase context failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return h.ctx.runAction(
        internal.mcp.codebases.mcpGetCodebaseSymbolContext,
        {
          clerkId: h.clerkUserId,
          codebaseId: params.codebaseId,
          symbolId: params.symbolId,
        },
      );
    },
  }),
  codebase_impact: toolSpec({
    name: "codebase_impact",
    schema: codebaseImpactSchema,
    description:
      "Traverse CALLS edges upstream (callers) or downstream (callees) from a symbol to estimate blast radius.",
    errorLabel: "Codebase impact failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return h.ctx.runAction(internal.mcp.codebases.mcpGetCodebaseImpact, {
        clerkId: h.clerkUserId,
        codebaseId: params.codebaseId,
        symbolId: params.symbolId,
        direction: params.direction,
        depth: params.depth,
      });
    },
  }),
  codebase_graph: toolSpec({
    name: "codebase_graph",
    schema: codebaseGraphSchema,
    description:
      "Fetch a filtered subgraph of a synced codebase: nodes plus relationship edges (imports, calls, contains, extends, implements, process links). Response may be truncated on large repos — use kinds, processId, or blastRadiusOf to narrow scope.",
    errorLabel: "Codebase graph failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return h.ctx.runAction(internal.mcp.codebases.mcpGetCodebaseGraph, {
        clerkId: h.clerkUserId,
        codebaseId: params.codebaseId,
        kinds: params.kinds,
        processId: params.processId,
        blastRadiusOf: params.blastRadiusOf,
        blastDirection: params.blastDirection,
        blastDepth: params.blastDepth,
      });
    },
  }),
};
