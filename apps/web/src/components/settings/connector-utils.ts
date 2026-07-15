import type { ComponentType } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import {
  GoogleDriveIcon,
  NotionIcon,
  GitHubIcon,
} from "@/components/brand-icons";

export type GitHubConnection = FunctionReturnType<
  typeof api.github.getConnection
>;

export type Connector = FunctionReturnType<
  typeof api.connectors.crud.listMy
>[number];

type ConnectorIconProps = { size?: number; className?: string };
type ConnectorIcon = ComponentType<ConnectorIconProps>;

const connectorIcons = new Map<string, ConnectorIcon>([
  ["IconBrandGoogleDrive", GoogleDriveIcon],
  ["IconBrandNotion", NotionIcon],
  ["IconBrandGithub", GitHubIcon],
]);

export function isGitHubConnector(connector: Connector): boolean {
  return connector.name === "GitHub";
}

export function resolveConnectorIcon(iconName: string): ConnectorIcon {
  return connectorIcons.get(iconName) ?? GoogleDriveIcon;
}

export function isConnectorConnected(
  connector: Connector,
  githubConnection: GitHubConnection | undefined,
): boolean {
  if (isGitHubConnector(connector)) {
    return githubConnection !== undefined && githubConnection !== null;
  }
  return connector.connectionStatus === "connected";
}

// connectable in UI — has OAuth provider or dedicated GitHub flow
export function isConnectorConnectable(connector: Connector): boolean {
  return isGitHubConnector(connector) || connector.provider !== undefined;
}
