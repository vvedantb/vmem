import type { FunctionReturnType } from "convex/server";
import type { Doc, api } from "@vmem/backend";

type GitHubConnection = FunctionReturnType<typeof api.github.getConnection>;

export function isConnectorConnected(
  connector: Doc<"connectors">,
  githubConnection: GitHubConnection | undefined,
): boolean {
  if (connector.name === "GitHub") {
    return githubConnection !== undefined && githubConnection !== null;
  }
  return connector.connectionStatus === "connected";
}

/** Connectable in UI — has OAuth provider or dedicated GitHub flow. */
export function isConnectorConnectable(connector: Doc<"connectors">): boolean {
  return connector.name === "GitHub" || connector.provider !== undefined;
}
