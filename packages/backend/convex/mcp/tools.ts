import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ActionCtx } from "../_generated/server";
import type { McpScope } from "../profiles/mcpAccess";
import {
  toMcpContent,
  type McpToolContent,
  type ToolHandlerResult,
} from "./content";
import { toolSpecs } from "./toolCatalog";
import { bindToolSpec, type ToolHandlerContext } from "./toolTypes";

function handlerContext(
  clerkUserId: string,
  ctx: ActionCtx,
  scope: McpScope,
): ToolHandlerContext {
  return { ctx, clerkUserId, scope };
}

type CatalogEntry = (typeof toolSpecs)[keyof typeof toolSpecs];

function isToolSpecKey(key: string): key is keyof typeof toolSpecs {
  return key in toolSpecs;
}

function registerMcpTool(
  server: McpServer,
  meta: CatalogEntry,
  scopeLabel: string,
  scope: McpScope,
  h: ToolHandlerContext,
): void {
  if (meta.scopes && !meta.scopes.includes(scope)) return;

  const bindable = bindToolSpec(meta);
  const description =
    typeof meta.description === "function"
      ? meta.description(scopeLabel)
      : meta.description;
  const toContent: (result: ToolHandlerResult) => McpToolContent =
    meta.toContent ?? ((result) => toMcpContent(result, meta.errorLabel));

  server.tool(
    bindable.name,
    description,
    bindable.schema.shape,
    async (params) => {
      let result: ToolHandlerResult;
      try {
        result = { ok: true, data: await bindable.run(h, params) };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[MCP][${bindable.name}]`, message);
        result = { ok: false, error: message };
      }
      return toContent(result);
    },
  );
}

export function registerTools(
  server: McpServer,
  clerkUserId: string,
  ctx: ActionCtx,
  scope: McpScope,
): void {
  const scopeLabel = scope === "team" ? "team" : "personal";
  const h = handlerContext(clerkUserId, ctx, scope);

  for (const key of Object.keys(toolSpecs)) {
    if (!isToolSpecKey(key)) continue;
    registerMcpTool(server, toolSpecs[key], scopeLabel, scope, h);
  }
}
