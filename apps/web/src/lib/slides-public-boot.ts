/**
 * `/slides` is public (password only for presenter pop-out). Vercel preview
 * hosts are often missing from Clerk's allowed domains, so mounting
 * `ClerkProvider` calls `clerk.vedantb.com/v1/client`, gets 400, and breaks
 * the deck. Detect the path once at boot and skip Clerk entirely — live share
 * / polls use anonymous Convex (`presentations.*` is unauthenticated).
 */
function isSlidesPublicPath(pathname: string): boolean {
  return pathname === "/slides" || pathname.startsWith("/slides/");
}

/** True when this JS context booted on `/slides` (no ClerkProvider). */
export const slidesPublicBoot =
  typeof window !== "undefined" && isSlidesPublicPath(window.location.pathname);

/** SPA left the no-Clerk tree — caller should `window.location.assign`. */
export function shouldFullLoadClerkOnNavigate(
  bootedWithoutClerk: boolean,
  nextPathname: string,
): boolean {
  return bootedWithoutClerk && !isSlidesPublicPath(nextPathname);
}
