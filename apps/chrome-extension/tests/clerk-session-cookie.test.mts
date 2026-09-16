import test from "node:test";
import assert from "node:assert/strict";
import {
  clerkConvexTokenUrl,
  clerkSessionIdFromJwt,
  convexJwtFromClerkResponse,
  readSessionJwtFromCookieHeader,
} from "../src/lib/clerk-session-cookie.ts";

function unsignedJwt(payload: Record<string, string>): string {
  const encode = (value: Record<string, string>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.x`;
}

await test("readSessionJwtFromCookieHeader prefers unsuffixed __session", () => {
  assert.equal(
    readSessionJwtFromCookieHeader(
      "__client_uat=1; __session_abc=suffixed; __session=primary; other=x",
    ),
    "primary",
  );
  assert.equal(
    readSessionJwtFromCookieHeader("__session_abc=suffixed"),
    "suffixed",
  );
  assert.equal(readSessionJwtFromCookieHeader("foo=bar"), null);
});

await test("clerkSessionIdFromJwt reads sid and ignores junk", () => {
  assert.equal(clerkSessionIdFromJwt(unsignedJwt({ sid: "sess_1" })), "sess_1");
  assert.equal(clerkSessionIdFromJwt("not-a-jwt"), null);
});

await test("clerkConvexTokenUrl is the native FAPI mint path", () => {
  assert.equal(
    clerkConvexTokenUrl("clerk.vedantb.com", "sess_1"),
    "https://clerk.vedantb.com/v1/client/sessions/sess_1/tokens/convex?_is_native=1",
  );
  assert.equal(
    clerkConvexTokenUrl("clerk.vedantb.com", "sess_1", { native: false }),
    "https://clerk.vedantb.com/v1/client/sessions/sess_1/tokens/convex",
  );
});

await test("convexJwtFromClerkResponse requires a jwt string", () => {
  assert.equal(
    convexJwtFromClerkResponse({ jwt: "a".repeat(24) }),
    "a".repeat(24),
  );
  assert.equal(convexJwtFromClerkResponse({ error: "nope" }), null);
});
