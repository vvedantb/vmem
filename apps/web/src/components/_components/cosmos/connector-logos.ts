// connector logo registry/loader for graph memory provenance stamps

const CONNECTOR_SOURCE_TYPES = ["google_drive", "notion"] as const;

type ConnectorSourceType = (typeof CONNECTOR_SOURCE_TYPES)[number];

export type ConnectorLogoMap = Map<ConnectorSourceType, HTMLImageElement>;

const LOGO_PATHS: Record<ConnectorSourceType, string> = {
  google_drive: "/connector-logos/google_drive.svg",
  notion: "/connector-logos/notion.svg",
};

let cachedPromise: Promise<ConnectorLogoMap> | null = null;

function loadOne(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// load connector logos once missing assets omitted
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
