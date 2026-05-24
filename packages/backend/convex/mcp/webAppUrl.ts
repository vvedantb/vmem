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
