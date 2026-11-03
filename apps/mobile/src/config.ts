/**
 * Production defaults, so a release build needs no secrets. Expo inlines
 * `EXPO_PUBLIC_*` at build time; set them in `.env.local` for dev.
 */

/** Same sign-in instance as vmem web (`clerk.projectv.uk`). A publishable key is public. */
const PROD_PUBLISHABLE_KEY = "pk_live_Y2xlcmsucHJvamVjdHYudWsk";

/** Convex HTTP actions host for `clear-bear-690` (same as the desktop recorder). */
const PROD_BASE_URL = "https://clear-bear-690.eu-west-1.convex.site";

export const PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || PROD_PUBLISHABLE_KEY;

export const VMEM_BASE_URL = (
  process.env.EXPO_PUBLIC_VMEM_BASE_URL || PROD_BASE_URL
).replace(/\/$/, "");

/** Redirect for Google sign-in: the `vmem://sso-callback` link the archived app used. */
export const SSO_SCHEME = "vmem";
export const SSO_PATH = "sso-callback";
