import { CLERK_PUBLISHABLE_KEY } from "@/lib/constants";

const PUBLISHABLE_KEY_LIVE_PREFIX = "pk_live_";
const PUBLISHABLE_KEY_TEST_PREFIX = "pk_test_";

function isValidDecodedPublishableKey(decoded: string): boolean {
  if (!decoded.endsWith("$")) return false;
  const withoutTrailing = decoded.slice(0, -1);
  if (withoutTrailing.includes("$")) return false;
  return withoutTrailing.includes(".");
}

/** Clerk Frontend API origin derived from the publishable key (e.g. https://*.clerk.accounts.dev). */
export function parseClerkFrontendApiOrigin(
  publishableKey: string,
): string | null {
  const isTest = publishableKey.startsWith(PUBLISHABLE_KEY_TEST_PREFIX);
  const isLive = publishableKey.startsWith(PUBLISHABLE_KEY_LIVE_PREFIX);
  if (!isTest && !isLive) return null;

  const parts = publishableKey.split("_");
  const encodedPart = parts[2];
  if (encodedPart === undefined) return null;

  const base64 = encodedPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  let decoded: string;
  try {
    decoded = atob(padded);
  } catch {
    return null;
  }

  if (!isValidDecodedPublishableKey(decoded)) return null;

  const frontendApi = decoded.slice(0, -1);
  return `https://${frontendApi}`;
}

export const CLERK_FRONTEND_API_ORIGIN =
  parseClerkFrontendApiOrigin(CLERK_PUBLISHABLE_KEY) ??
  "https://flexible-duckling-74.clerk.accounts.dev";
