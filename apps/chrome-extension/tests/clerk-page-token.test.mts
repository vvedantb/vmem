import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLERK_PUBLISHABLE_KEY, clerkFrontendApiHost } from "../src/lib/constants.ts";
import { clerkConvexTokenUrl } from "../src/lib/clerk-session-cookie.ts";
import {
  CLERK_PAGE_TOKEN_SOURCE,
  clerkPageTokenMessage,
  parseClerkPageTokenMessage,
} from "../src/lib/clerk-page-token-message.ts";
import { mintConvexTokenWithPageCookies } from "../src/lib/mint-convex-token-from-page.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

await test("parseClerkPageTokenMessage accepts only vmem page-mint payloads", () => {
  const jwt = "a".repeat(24);
  assert.equal(parseClerkPageTokenMessage(clerkPageTokenMessage(jwt)), jwt);
  assert.equal(parseClerkPageTokenMessage({ source: "other", jwt }), null);
  assert.equal(
    parseClerkPageTokenMessage({
      source: CLERK_PAGE_TOKEN_SOURCE,
      jwt: "short",
    }),
    null,
  );
});

await test("mintConvexTokenWithPageCookies posts credentials-include then native", async () => {
  const host = clerkFrontendApiHost(CLERK_PUBLISHABLE_KEY);
  assert.ok(host);
  const urls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    urls.push(url);
    assert.equal(init?.credentials, "include");
    assert.equal(init?.method, "POST");
    if (urls.length === 1) {
      return new Response("nope", { status: 401 });
    }
    return Response.json({ jwt: "b".repeat(24) });
  };
  try {
    const jwt = await mintConvexTokenWithPageCookies("sess_1");
    assert.equal(jwt, "b".repeat(24));
    assert.equal(urls[0], clerkConvexTokenUrl(host, "sess_1", { native: false }));
    assert.equal(urls[1], clerkConvexTokenUrl(host, "sess_1"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test("TokenSync keeps page-minted JWT when Clerk getToken is empty", () => {
  const src = readFileSync(
    path.join(
      repoRoot,
      "apps/chrome-extension/src/popup/_components/TokenSync.tsx",
    ),
    "utf8",
  );
  assert.match(src, /if \(active && token\)/);
  assert.match(src, /if \(token\)/);
  assert.doesNotMatch(src, /setAuthToken\(token \?\? ""\)/);
});
