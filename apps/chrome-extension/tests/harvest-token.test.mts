// harvest Convex JWT from a signed-in vmem tab
// AI-generated (Claude), prompt: "unit tests for clerk token harvest from vmem web tab"
// Modified by me: origin matching, empty inject, tab listener idempotence
import test from "node:test";
import assert from "node:assert/strict";
import { installChromeMock } from "./helpers/chrome-mock.mts";

const chromeState = installChromeMock();

const {
  isWebAppSyncUrl,
  harvestConvexTokenFromTab,
  harvestConvexTokenFromOpenVmemTabs,
  registerWebClerkTokenHarvest,
} = await import("../src/background/harvest-web-clerk-token.ts");

await test("isWebAppSyncUrl matches the Clerk web sync origin only", () => {
  assert.equal(
    isWebAppSyncUrl(
      "https://vmem.vedantb.com/home",
      "https://vmem.vedantb.com",
    ),
    true,
  );
  assert.equal(
    isWebAppSyncUrl(
      "https://vmem.vedantb.com/home",
      "https://clerk.vedantb.com",
    ),
    false,
  );
  assert.equal(
    isWebAppSyncUrl("https://example.com/", "https://vmem.vedantb.com"),
    false,
  );
  assert.equal(isWebAppSyncUrl(undefined, "https://vmem.vedantb.com"), false);
});

await test("harvestConvexTokenFromTab records no-inject-result when scripting returns empty", async () => {
  const result = await harvestConvexTokenFromTab(7);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-inject-result");
  assert.equal(chromeState.executeScriptCalls.at(-1)?.tabId, 7);
});

await test("harvestConvexTokenFromOpenVmemTabs skips non-sync-host tabs", async () => {
  chromeState.activeTab = {
    id: 3,
    url: "https://example.com/",
    title: "Example",
  };
  const result = await harvestConvexTokenFromOpenVmemTabs();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-vmem-tab");
});

await test("registerWebClerkTokenHarvest is idempotent", () => {
  registerWebClerkTokenHarvest();
  registerWebClerkTokenHarvest();
});
