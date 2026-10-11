import type { McpScope } from "../profiles/mcpAccess";

export const MCP_SERVER_VERSION = "1.1.0";

export const MCP_ACCEPTED_TOKEN_TYPES = [
  "oauth_token",
  "session_token",
] as const;

export type McpAcceptedTokenType = (typeof MCP_ACCEPTED_TOKEN_TYPES)[number];

export function isMcpAcceptedTokenType(
  tokenType: string,
): tokenType is McpAcceptedTokenType {
  for (const allowed of MCP_ACCEPTED_TOKEN_TYPES) {
    if (tokenType === allowed) {
      return true;
    }
  }
  return false;
}

export function mcpServerInfo(scope: McpScope): {
  name: string;
  version: string;
} {
  return {
    name: scope === "team" ? "vmem-mcp-team" : "vmem-mcp",
    version: MCP_SERVER_VERSION,
  };
}
