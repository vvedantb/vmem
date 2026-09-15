/**
 * Deployed web app origin — mobile loads shared static assets from it
 * (e.g. /model-providers/*.svg brand logos in apps/web/public).
 */
export const WEB_APP_URL =
  process.env.EXPO_PUBLIC_WEB_APP_URL ?? "https://vmem.vedantb.com";
