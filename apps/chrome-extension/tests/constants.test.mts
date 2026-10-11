// Clerk host helpers and Project V source fallbacks
import test from "node:test";
import assert from "node:assert/strict";

const {
  clerkFrontendApiHost,
  clerkCookieSyncHost,
  CLERK_PUBLISHABLE_KEY,
  CONVEX_URL,
  CLERK_SYNC_HOST,
  CLERK_COOKIE_SYNC_HOST,
  WEB_APP_ORIGINS,
} = await import("../src/lib/constants.ts");

const LIVE_KEY = "pk_live_Y2xlcmsucHJvamVjdHYudWsk";
const TEST_KEY = "pk_test_YWxsb3dpbmctY295b3RlLTgwLmNsZXJrLmFjY291bnRzLmRldiQ";

await test("clerkFrontendApiHost decodes the Project V key", () => {
  assert.equal(clerkFrontendApiHost(LIVE_KEY), "clerk.projectv.uk");
});

await test("clerkCookieSyncHost uses FAPI for live keys only", () => {
  assert.equal(
    clerkCookieSyncHost(LIVE_KEY, "https://vmem.projectv.uk"),
    "https://clerk.projectv.uk",
  );
  assert.equal(
    clerkCookieSyncHost(TEST_KEY, "http://localhost:5173"),
    "http://localhost:5173",
  );
});

await test("source fallbacks point at Project V prod", () => {
  assert.equal(CLERK_PUBLISHABLE_KEY, LIVE_KEY);
  assert.equal(CONVEX_URL, "https://clear-bear-690.eu-west-1.convex.cloud");
  assert.equal(CLERK_SYNC_HOST, "https://vmem.projectv.uk");
  assert.equal(CLERK_COOKIE_SYNC_HOST, "https://clerk.projectv.uk");
});

await test("WEB_APP_ORIGINS has both prod origins without duplicates", () => {
  assert.deepEqual(
    [...WEB_APP_ORIGINS],
    ["https://vmem.projectv.uk", "https://vmem.vedantb.com"],
  );
});
