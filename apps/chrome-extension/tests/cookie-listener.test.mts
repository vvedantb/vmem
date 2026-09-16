// sync-host cookie matching for clerk session cookies
// AI-generated (Claude), prompt: "unit tests for chrome extension clerk cookie listener"
// Modified by me: prod __client vs dev jwt, subdomain, ignored names
import test from "node:test";
import assert from "node:assert/strict";
import { installChromeMock } from "./helpers/chrome-mock.mts";

const chromeState = installChromeMock();

const {
  isSessionCookieOnSyncHost,
  syncHostCookieDomain,
  registerSyncHostCookieListener,
} = await import("../src/background/sync-host-cookie-listener.ts");

await test("syncHostCookieDomain strips www", () => {
  assert.equal(
    syncHostCookieDomain("https://www.vmem.vedantb.com"),
    "vmem.vedantb.com",
  );
  assert.equal(
    syncHostCookieDomain("https://vmem.vedantb.com"),
    "vmem.vedantb.com",
  );
});

await test("prod __client cookie on the sync host is a session cookie", () => {
  assert.equal(
    isSessionCookieOnSyncHost(
      { name: "__client", domain: "vmem.vedantb.com" },
      "https://vmem.vedantb.com",
    ),
    true,
  );
});

await test("dev __clerk_db_jwt cookie on a dotted domain matches", () => {
  assert.equal(
    isSessionCookieOnSyncHost(
      { name: "__clerk_db_jwt", domain: ".vmem.vedantb.com" },
      "https://vmem.vedantb.com",
    ),
    true,
  );
});

await test("unrelated cookies and other sites are ignored", () => {
  assert.equal(
    isSessionCookieOnSyncHost(
      { name: "sid", domain: "vmem.vedantb.com" },
      "https://vmem.vedantb.com",
    ),
    false,
  );
  assert.equal(
    isSessionCookieOnSyncHost(
      { name: "__client", domain: "evil.example" },
      "https://vmem.vedantb.com",
    ),
    false,
  );
});

await test("registerSyncHostCookieListener is idempotent and ignores removals", () => {
  registerSyncHostCookieListener();
  registerSyncHostCookieListener();
  assert.equal(chromeState.cookieChangeListeners.length, 1);

  chromeState.cookieChangeListeners[0]?.({
    removed: true,
    cookie: {
      name: "__client",
      domain: "vmem.vedantb.com",
    },
  });
  assert.equal(chromeState.cookieChangeListeners.length, 1);
});
