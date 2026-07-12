/**
 * Connector-logo registry + loader for the graph renderer.
 *
 * Memories that arrive through a connector sync carry a `sourceType` (gmail,
 * google_drive, notion). The renderer stamps the connector's brand logo inside
 * the memory's coloured circle so provenance reads at a glance, while the
 * tag-hash fill keeps encoding topic.
 *
 * Loading is memoised at module scope: the first caller kicks off the fetches,
 * every subsequent caller reuses the same promise. Images that fail to load
 * are skipped (the renderer falls back to a plain circle), so a broken asset
 * never breaks the whole graph.
 */

const CONNECTOR_SOURCE_TYPES = ["gmail", "google_drive", "notion"] as const;

type ConnectorSourceType = (typeof CONNECTOR_SOURCE_TYPES)[number];

export type ConnectorLogoMap = Map<ConnectorSourceType, HTMLImageElement>;

const LOGO_PATHS: Record<ConnectorSourceType, string> = {
  gmail: "/connector-logos/gmail.svg",
  google_drive: "/connector-logos/google_drive.svg",
  notion: "/connector-logos/notion.svg",
};

/** Narrow a raw string to a known connector source type, or return null. */
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

/**
 * Load all connector logos into a Map keyed by sourceType. Idempotent — the
 * first call fetches, later calls return the same promise. Missing/broken
 * assets are simply omitted from the returned map.
 */
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

/**
 * Resolve a node's raw `sourceType` string to a loaded logo image, or null if
 * the sourceType isn't a known connector or the image hasn't finished loading
 * (or failed to load).
 */
export function getConnectorLogo(
  sourceType: string | null,
  logoMap: ConnectorLogoMap,
): HTMLImageElement | null {
  if (sourceType === null) return null;
  const known = asConnectorSourceType(sourceType);
  if (known === null) return null;
  return logoMap.get(known) ?? null;
}
