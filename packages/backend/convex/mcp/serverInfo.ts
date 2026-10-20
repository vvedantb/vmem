import { defineMcpServerInfo, type ClerkTokenType } from "@vvedantb/server";
import type { McpScope } from "../profiles/mcpAccess";

export const MCP_SERVER_VERSION = "2.1.0";

export const MCP_ACCEPTED_TOKEN_TYPES: readonly ClerkTokenType[] = [
  "oauth_token",
  "session_token",
];

export function mcpServerInfo(scope: McpScope): {
  name: string;
  version: string;
} {
  return defineMcpServerInfo({
    name: scope === "team" ? "vmem-mcp-team" : "vmem-mcp",
    version: MCP_SERVER_VERSION,
  });
}
