import { getMcpFaviconDataUri } from "./favicon";

export function getConvexSiteUrl(): string {
  const url = process.env.CONVEX_SITE_URL;
  if (!url) {
    throw new Error("CONVEX_SITE_URL is not set in Convex env");
  }
  return url.replace(/\/$/, "");
}

export function getWebAppUrl(): string {
  const url = process.env.WEB_APP_URL;
  if (!url) {
    throw new Error("WEB_APP_URL is not set in Convex env");
  }
  return url.replace(/\/$/, "");
}

export function getMcpResourceDocumentationUrl(): string {
  return getWebAppUrl();
}

export function buildMcpServerInfo(siteOrigin?: string) {
  const webAppUrl = getWebAppUrl();
  const siteUrl = siteOrigin ?? getConvexSiteUrl();
  const dataUriIcon = getMcpFaviconDataUri();

  return {
    name: "vmem-mcp",
    title: "vmem",
    version: "1.0.0",
    description:
      "Model-agnostic memory layer — graph-backed store, search, and MCP tools for Claude and other agents.",
    websiteUrl: webAppUrl,
    icons: [
      {
        src: dataUriIcon,
        mimeType: "image/png",
        sizes: ["270x270"],
      },
      {
        src: `${webAppUrl}/favicon.png`,
        mimeType: "image/png",
        sizes: ["48x48", "192x192"],
      },
      {
        src: `${siteUrl}/favicon.png`,
        mimeType: "image/png",
        sizes: ["32x32"],
      },
    ],
  };
}
