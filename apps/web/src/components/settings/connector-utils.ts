import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";

export type GitHubConnection = FunctionReturnType<
  typeof api.github.getConnection
>;

export type Connector = FunctionReturnType<
  typeof api.connectors.crud.listMy
>[number];

export function isConnectorConnected(
  connector: Connector,
  githubConnection: GitHubConnection | undefined,
): boolean {
  if (connector.name === "GitHub") {
    return githubConnection !== undefined && githubConnection !== null;
  }
  return connector.connectionStatus === "connected";
}

// connectable in UI — has OAuth provider or dedicated GitHub flow
export function isConnectorConnectable(connector: Connector): boolean {
  return connector.name === "GitHub" || connector.provider !== undefined;
}
