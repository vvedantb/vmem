import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMemoryGraphApp } from "../../convex/mcp/memoryGraphApp";
import { registerTools } from "../../convex/mcp/tools";
import { toolSpecs } from "../../convex/mcp/toolCatalog";
import { bindToolSpec } from "../../convex/mcp/toolTypes";
import { toMcpContent } from "../../convex/mcp/content";
import { getMemoryGraphForMcp } from "../../convex/mcp/graph";
import type { McpScope } from "../../convex/profiles/mcpAccess";
import { extractBearerToken } from "../../convex/lib/bearerToken";
import { catalogNamesForScope, MEMORY_GRAPH_TOOL } from "./catalog";
import type { McpHttpResponse } from "./client";
import { parseMcpHttpError, requireJsonRpcResult } from "./client";
import {
  jsonRpcRequestSchema,
  mcpInitializeResultSchema,
  mcpToolContentSchema,
  mcpToolsListResultSchema,
  toolsCallParamsSchema,
} from "./schemas";
import type { McpInitializeResult, McpToolContent } from "./schemas";
import {
  createMockActionCtx,
  createMockStore,
  MOCK_CLERK_ID,
  type MockStore,
} from "./mockBackend";

export const MOCK_MCP_TOKEN = "mcp_test_bearer";

export type InProcessSession = {
  store: MockStore;
  scope: McpScope;
};

export function createInProcessSession(
  scope: McpScope = "personal",
): InProcessSession {
  return { store: createMockStore(), scope };
}

function unauthorized(message: string, scope: McpScope): McpHttpResponse {
  const resource =
    scope === "team"
      ? 'Bearer resource_metadata="https://example.test/.well-known/oauth-protected-resource/mcp/team"'
      : 'Bearer resource_metadata="https://example.test/.well-known/oauth-protected-resource"';
  return {
    status: 401,
    json: { error: message },
    wwwAuthenticate: resource,
  };
}

function jsonRpcResult(id: unknown, result: unknown): McpHttpResponse {
  return {
    status: 200,
    json: { jsonrpc: "2.0", id: id ?? null, result },
    wwwAuthenticate: null,
  };
}

function jsonRpcError(
  id: unknown,
  message: string,
  status = 200,
): McpHttpResponse {
  return {
    status,
    json: {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32603, message },
    },
    wwwAuthenticate: null,
  };
}

async function callCatalogTool(
  session: InProcessSession,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const ctx = createMockActionCtx(session.store);
  const h = {
    ctx,
    clerkUserId: MOCK_CLERK_ID,
    scope: session.scope,
  };

  if (name === MEMORY_GRAPH_TOOL) {
    try {
      const limit = args.limit;
      if (
        limit !== undefined &&
        (typeof limit !== "number" ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 100)
      ) {
        throw new Error("Invalid limit");
      }
      const graph = await getMemoryGraphForMcp(ctx, {
        clerkId: MOCK_CLERK_ID,
        mcpScope: session.scope,
        profileId:
          typeof args.profileId === "string" ? args.profileId : undefined,
        focus: typeof args.focus === "string" ? args.focus : undefined,
        memoryIds: Array.isArray(args.memoryIds)
          ? args.memoryIds.filter((id): id is string => typeof id === "string")
          : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      return {
        content: [
          {
            type: "text",
            text: `Memory graph: ${String(graph.stats.nodeCount)} memories.`,
          },
        ],
        structuredContent: graph,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return toMcpContent({ ok: false, error: message }, "Memory graph failed");
    }
  }

  const spec = Object.values(toolSpecs).find((entry) => entry.name === name);
  if (!spec) {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (spec.scopes !== undefined && !spec.scopes.includes(session.scope)) {
    throw new Error(`Tool ${name} is not available on ${session.scope} MCP`);
  }

  const bindable = bindToolSpec(spec);
  try {
    const data = await bindable.run(h, args);
    return toMcpContent({ ok: true, data }, spec.errorLabel);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return toMcpContent({ ok: false, error: message }, spec.errorLabel);
  }
}

export async function handleInProcessMcpRequest(args: {
  session: InProcessSession;
  authorization: string | null;
  body: unknown;
}): Promise<McpHttpResponse> {
  const token = extractBearerToken(args.authorization);
  if (!token) {
    return unauthorized("Missing Authorization header", args.session.scope);
  }
  if (token !== MOCK_MCP_TOKEN) {
    return unauthorized("Invalid or expired token", args.session.scope);
  }

  const request = jsonRpcRequestSchema.safeParse(args.body);
  if (!request.success) {
    return {
      status: 400,
      json: { error: "Invalid JSON body" },
      wwwAuthenticate: null,
    };
  }

  const { method, id, params } = request.data;
  if (method === "initialize") {
    return jsonRpcResult(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: {
        name: args.session.scope === "team" ? "vmem-mcp-team" : "vmem-mcp",
        version: "1.0.0",
      },
    });
  }
  if (method === "tools/list") {
    const names = catalogNamesForScope(args.session.scope);
    return jsonRpcResult(id, {
      tools: names.map((name) => {
        if (name === MEMORY_GRAPH_TOOL) {
          return {
            name,
            description: "Show an interactive pan/zoom graph of memories",
          };
        }
        const spec = Object.values(toolSpecs).find(
          (entry) => entry.name === name,
        );
        const description =
          spec === undefined
            ? name
            : typeof spec.description === "function"
              ? spec.description(args.session.scope)
              : spec.description;
        return { name, description };
      }),
    });
  }
  if (method === "tools/call") {
    const call = toolsCallParamsSchema.safeParse(params);
    if (!call.success) {
      return jsonRpcError(id, "Invalid tools/call params");
    }
    try {
      const result = await callCatalogTool(
        args.session,
        call.data.name,
        call.data.arguments ?? {},
      );
      const parsed = mcpToolContentSchema.safeParse(result);
      return jsonRpcResult(id, parsed.success ? parsed.data : result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return jsonRpcError(id, message);
    }
  }
  return jsonRpcError(id, `Unknown method: ${method}`);
}

export class InProcessMcpClient {
  readonly session: InProcessSession;
  readonly token: string | null;
  private nextId = 1;

  constructor(args: { session?: InProcessSession; token: string | null }) {
    this.session = args.session ?? createInProcessSession("personal");
    this.token = args.token;
  }

  async request(method: string, params?: unknown): Promise<McpHttpResponse> {
    const id = this.nextId;
    this.nextId += 1;
    const authorization = this.token === null ? null : `Bearer ${this.token}`;
    return handleInProcessMcpRequest({
      session: this.session,
      authorization,
      body: { jsonrpc: "2.0", id, method, params: params ?? {} },
    });
  }

  async initialize(): Promise<McpInitializeResult> {
    const response = await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "vmem-mcp-harness", version: "0.1.0" },
    });
    if (response.status !== 200) {
      throw new Error(
        parseMcpHttpError(response.json) ??
          `initialize HTTP ${response.status}`,
      );
    }
    const parsed = mcpInitializeResultSchema.safeParse(
      requireJsonRpcResult(response.json),
    );
    if (!parsed.success) {
      throw new Error("initialize result did not match schema");
    }
    return parsed.data;
  }

  async listTools(): Promise<string[]> {
    const response = await this.request("tools/list");
    if (response.status !== 200) {
      throw new Error(
        parseMcpHttpError(response.json) ??
          `tools/list HTTP ${response.status}`,
      );
    }
    const parsed = mcpToolsListResultSchema.safeParse(
      requireJsonRpcResult(response.json),
    );
    if (!parsed.success) {
      throw new Error("tools/list result did not match schema");
    }
    return parsed.data.tools.map((tool) => tool.name);
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolContent> {
    const response = await this.request("tools/call", {
      name,
      arguments: args,
    });
    if (response.status !== 200) {
      throw new Error(
        parseMcpHttpError(response.json) ??
          `tools/call HTTP ${response.status}`,
      );
    }
    const parsed = mcpToolContentSchema.safeParse(
      requireJsonRpcResult(response.json),
    );
    if (!parsed.success) {
      throw new Error(`tools/call ${name} result did not match schema`);
    }
    return parsed.data;
  }
}

// keep McpServer + registerTools imported so the live path cannot drift from
// the in-process catalog without a type error if signatures change.
export function assertServerToolRegistrationCompiles(scope: McpScope): void {
  const server = new McpServer({
    name: "vmem-mcp-harness",
    version: "0.0.0",
  });
  const ctx = createMockActionCtx(createMockStore());
  registerTools(server, MOCK_CLERK_ID, ctx, scope);
  registerMemoryGraphApp(server, MOCK_CLERK_ID, ctx, scope);
}
