/**
 * Neo4j `sourceType` values written by each connector provider.
 */
export const CONNECTOR_PROVIDER_SOURCE_TYPES = {
  google_drive: ["google_drive"],
  notion: ["notion"],
} as const;

export type ConnectorProviderKey = keyof typeof CONNECTOR_PROVIDER_SOURCE_TYPES;

function isConnectorProviderKey(value: string): value is ConnectorProviderKey {
  return value in CONNECTOR_PROVIDER_SOURCE_TYPES;
}

export function sourceTypesForProvider(
  provider: string,
): readonly string[] | null {
  if (!isConnectorProviderKey(provider)) {
    return null;
  }
  return CONNECTOR_PROVIDER_SOURCE_TYPES[provider];
}
