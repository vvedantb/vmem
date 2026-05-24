import { MCP_FAVICON_PNG_BASE64 } from "./bundled/mcpFaviconPng";

/** Inline icon for MCP initialize (avoids host eTLD collapsing `*.eu-west-1.convex.site`). */
export function getMcpFaviconDataUri(): string {
  return `data:image/png;base64,${MCP_FAVICON_PNG_BASE64}`;
}

/** PNG bytes for /favicon.png and /favicon.ico on the Convex site origin. */
export function getMcpFaviconPngBytes(): Uint8Array {
  const binary = atob(MCP_FAVICON_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const MCP_FAVICON_CACHE_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=86400",
} as const;

export function mcpFaviconResponse(): Response {
  return new Response(getMcpFaviconPngBytes(), {
    headers: MCP_FAVICON_CACHE_HEADERS,
  });
}
