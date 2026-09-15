import type { ComponentType } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import { GoogleDriveIcon, NotionIcon } from "@/components/icons/logos";

export type Connector = FunctionReturnType<
  typeof api.connectors.crud.listMy
>[number];

type ConnectorIconProps = { size?: number; className?: string };
type ConnectorIcon = ComponentType<ConnectorIconProps>;

const connectorIcons = new Map<string, ConnectorIcon>([
  ["IconBrandGoogleDrive", GoogleDriveIcon],
  ["IconBrandNotion", NotionIcon],
]);

export function resolveConnectorIcon(iconName: string): ConnectorIcon {
  return connectorIcons.get(iconName) ?? GoogleDriveIcon;
}

export function isConnectorConnected(connector: Connector): boolean {
  return connector.connectionStatus === "connected";
}

export function isConnectorConnectable(connector: Connector): boolean {
  return connector.provider !== undefined;
}
