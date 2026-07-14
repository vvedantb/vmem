// connector logo registry/loader for graph memory provenance stamps

const CONNECTOR_SOURCE_TYPES = ["google_drive", "notion"] as const;

type ConnectorSourceType = (typeof CONNECTOR_SOURCE_TYPES)[number];

export type ConnectorLogoMap = Map<ConnectorSourceType, HTMLImageElement>;

const LOGO_PATHS: Record<ConnectorSourceType, string> = {
  google_drive: "/connector-logos/google_drive.svg",
  notion: "/connector-logos/notion.svg",
};

// narrow raw string to known connector source type
function asConnectorSourceType(value: string): ConnectorSourceType | null {
  for (const t of CONNECTOR_SOURCE_TYPES) {
    if (value === t) return t;
  }
  return null;
}

let cachedPromise: Promise<ConnectorLogoMap> | null = null;

function loadOne(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// load connector logos once; missing assets omitted
export function loadConnectorLogos(): Promise<ConnectorLogoMap> {
  if (cachedPromise) return cachedPromise;
  cachedPromise = (async () => {
    const map: ConnectorLogoMap = new Map();
    const entries = await Promise.all(
      CONNECTOR_SOURCE_TYPES.map(async (type) => {
        const img = await loadOne(LOGO_PATHS[type]);
        return [type, img] as const;
      }),
    );
    for (const [type, img] of entries) {
      if (img) map.set(type, img);
    }
    return map;
  })();
  return cachedPromise;
}

// logo for sourceType, or null if unknown/unloaded
export function getConnectorLogo(
  sourceType: string | null,
  logoMap: ConnectorLogoMap,
): HTMLImageElement | null {
  if (sourceType === null) return null;
  const known = asConnectorSourceType(sourceType);
  if (known === null) return null;
  return logoMap.get(known) ?? null;
}
