import type { McpInitializeResult, McpToolContent } from "./schemas";
import {
  jsonRpcErrorSchema,
  jsonRpcSuccessSchema,
  mcpHttpErrorSchema,
  mcpInitializeResultSchema,
  mcpToolContentSchema,
  mcpToolsListResultSchema,
} from "./schemas";

export const DEFAULT_MCP_SITE = "https://clear-bear-690.eu-west-1.convex.site";

export type McpScopePath = "personal" | "team";

export type McpHttpResponse = {
  status: number;
  json: unknown;
  wwwAuthenticate: string | null;
};

function mcpUrl(site: string, scope: McpScopePath): string {
  return scope === "team" ? `${site}/mcp/team` : `${site}/mcp`;
}

export async function mcpPost(args: {
  site: string;
  scope: McpScopePath;
  token: string | null;
  body: unknown;
}): Promise<McpHttpResponse> {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  });
  if (args.token !== null) {
    headers.set("Authorization", `Bearer ${args.token}`);
  }
  const response = await fetch(mcpUrl(args.site, args.scope), {
    method: "POST",
    headers,
    body: JSON.stringify(args.body),
  });
  const json: unknown = await response.json().catch(() => null);
  return {
    status: response.status,
    json,
    wwwAuthenticate: response.headers.get("WWW-Authenticate"),
  };
}

export function parseMcpHttpError(json: unknown): string | null {
  const parsed = mcpHttpErrorSchema.safeParse(json);
  return parsed.success ? parsed.data.error : null;
}

export function requireJsonRpcResult(json: unknown): unknown {
  const error = jsonRpcErrorSchema.safeParse(json);
  if (error.success) {
    throw new Error(error.data.error.message);
  }
  const success = jsonRpcSuccessSchema.safeParse(json);
  if (!success.success) {
    throw new Error("MCP response was not JSON-RPC");
  }
  return success.data.result;
}

export class McpClient {
  readonly site: string;
  readonly scope: McpScopePath;
  readonly token: string | null;
  private nextId = 1;

  constructor(args: {
    site?: string;
    scope?: McpScopePath;
    token: string | null;
  }) {
    this.site = args.site ?? DEFAULT_MCP_SITE;
    this.scope = args.scope ?? "personal";
    this.token = args.token;
  }

  async request(method: string, params?: unknown): Promise<McpHttpResponse> {
    const id = this.nextId;
    this.nextId += 1;
    return mcpPost({
      site: this.site,
      scope: this.scope,
      token: this.token,
      body: {
        jsonrpc: "2.0",
        id,
        method,
        params: params ?? {},
      },
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

export function toolText(result: McpToolContent): string {
  for (const part of result.content) {
    if (part.type === "text") return part.text;
  }
  return "";
}

export function parseToolJson(result: McpToolContent): unknown {
  const raw: unknown = JSON.parse(toolText(result)) as unknown;
  return raw;
}
