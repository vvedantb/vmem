import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthenticatedUser } from "./auth.js";

export function registerTools(
  server: McpServer,
  user: AuthenticatedUser,
): void {
  server.tool(
    "ping",
    "Health check tool for connector validation.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ok: true,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "whoami",
    "Returns the authenticated Clerk user ID for the current connector session.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                authenticated: true,
                clerkUserId: user.clerkUserId,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "memory_backend_status",
    "Reports whether the long-term memory backend is connected.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "not_implemented",
                message:
                  "Auth is live. Memory storage tools will be enabled once the vector/graph backend is wired.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
