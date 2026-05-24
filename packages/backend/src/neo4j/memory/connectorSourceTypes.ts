/**
 * Neo4j `sourceType` values written by each connector provider.
 * Linear uses a second type for project nodes.
 */
export const CONNECTOR_PROVIDER_SOURCE_TYPES = {
  google_drive: ["google_drive"],
  gmail: ["gmail"],
  notion: ["notion"],
  onedrive: ["onedrive"],
  linear: ["linear", "linear_project"],
} as const;

export type ConnectorProviderKey = keyof typeof CONNECTOR_PROVIDER_SOURCE_TYPES;

function isConnectorProviderKey(value: string): value is ConnectorProviderKey {
  return Object.hasOwn(CONNECTOR_PROVIDER_SOURCE_TYPES, value);
}

export function sourceTypesForProvider(
  provider: string,
): readonly string[] | null {
  if (!isConnectorProviderKey(provider)) {
    return null;
  }
  return CONNECTOR_PROVIDER_SOURCE_TYPES[provider];
}
