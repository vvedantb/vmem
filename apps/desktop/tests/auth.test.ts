import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isSessionToken, SessionAuth } from "../src/auth";
import { FALLBACK_PUBLISHABLE_KEY, sessionIssuer } from "../src/clerk";
import { SettingsStore } from "../src/settings";

const ISSUER = sessionIssuer(FALLBACK_PUBLISHABLE_KEY);

function jwt(claims: object): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.sig`;
}

const SESSION = jwt({ iss: ISSUER, sub: "user_1", exp: 1 });

function tempSettings(): SettingsStore {
  return new SettingsStore(mkdtempSync(join(tmpdir(), "vmem-auth-")));
}

/** A SessionAuth whose window is a spy. `answer` is what the window sends back, if anything. */
function setup(
  options: {
    window?: boolean;
    answer?: (auth: SessionAuth) => void;
    timeoutMs?: number;
  } = {},
) {
  const settings = tempSettings();
  let asked = 0;
  const auth: SessionAuth = new SessionAuth({
    settings,
    issuer: ISSUER,
    timeoutMs: options.timeoutMs ?? 1_000,
    askWindow: () => {
      asked += 1;
      if (options.window === false) return false;
      // The window answers later, over IPC.
      setImmediate(() => options.answer?.(auth));
      return true;
    },
  });
  return { auth, settings, asked: () => asked };
}

describe("isSessionToken", () => {
  it("accepts a session token from vmem's instance", () => {
    assert.equal(ISSUER, "https://clerk.projectv.uk");
    assert.equal(isSessionToken(SESSION, ISSUER), true);
  });

  it("rejects another issuer, a missing user and non-JWTs", () => {
    for (const token of [
      jwt({ iss: "https://clerk.example.com", sub: "user_1" }),
      jwt({ iss: ISSUER }),
      jwt({ iss: ISSUER, sub: "" }),
      "vmem_sk_test",
      "a.b.c",
      "",
    ]) {
      assert.equal(isSessionToken(token, ISSUER), false, token);
    }
  });
});

describe("SessionAuth sign-in state", () => {
  it("starts signed out and keeps the reported state across restarts", () => {
    const settings = tempSettings();
    const auth = new SessionAuth({
      settings,
      issuer: ISSUER,
      askWindow: () => false,
    });
    assert.equal(auth.isSignedIn(), false);
    auth.setSignedIn(true);
    assert.equal(auth.isSignedIn(), true);
    assert.equal(settings.get().signedIn, true);
    auth.setSignedIn(false);
    assert.equal(auth.isSignedIn(), false);
  });

  it("drops the API key that an older install saved on sign-in, not on a signed-out report", () => {
    const { auth, settings } = setup();
    settings.update({ apiKey: "vmem_sk_old" });
    auth.setSignedIn(false);
    assert.equal(settings.get().apiKey, "vmem_sk_old");
    auth.setSignedIn(true);
    assert.equal(settings.get().apiKey, "");
  });

  it("notifies only on a change and ignores malformed reports", () => {
    const { auth } = setup();
    let changes = 0;
    auth.onChange(() => (changes += 1));
    auth.setSignedIn(false);
    auth.setSignedIn("yes");
    auth.setSignedIn(undefined);
    assert.equal(changes, 0);
    auth.setSignedIn(true);
    auth.setSignedIn(true);
    assert.equal(changes, 1);
  });
});

describe("SessionAuth.sessionToken", () => {
  it("does not ask the window when signed out", async () => {
    const { auth, asked } = setup({ answer: (a) => a.receiveToken(SESSION) });
    assert.equal(await auth.sessionToken(), null);
    assert.equal(asked(), 0);
  });

  it("asks the window for a fresh token each time", async () => {
    const { auth, asked } = setup({ answer: (a) => a.receiveToken(SESSION) });
    auth.setSignedIn(true);
    assert.equal(await auth.sessionToken(), SESSION);
    assert.equal(await auth.sessionToken(), SESSION);
    assert.equal(asked(), 2);
  });

  it("shares one request between callers", async () => {
    const { auth, asked } = setup({ answer: (a) => a.receiveToken(SESSION) });
    auth.setSignedIn(true);
    const tokens = await Promise.all([
      auth.sessionToken(),
      auth.sessionToken(),
    ]);
    assert.deepEqual(tokens, [SESSION, SESSION]);
    assert.equal(asked(), 1);
  });

  it("returns null without a window, and asks again next time", async () => {
    const { auth, asked } = setup({ window: false });
    auth.setSignedIn(true);
    assert.equal(await auth.sessionToken(), null);
    assert.equal(await auth.sessionToken(), null);
    assert.equal(asked(), 2);
  });

  it("returns null when the window answers null, a wrong token or garbage", async () => {
    for (const reply of [
      null,
      jwt({ iss: "https://clerk.example.com", sub: "u" }),
      42,
      { token: SESSION },
    ]) {
      const { auth } = setup({ answer: (a) => a.receiveToken(reply) });
      auth.setSignedIn(true);
      assert.equal(await auth.sessionToken(), null, JSON.stringify(reply));
    }
  });

  it("times out when the window does not answer, and drops a late answer", async () => {
    const { auth } = setup({ timeoutMs: 20 });
    auth.setSignedIn(true);
    assert.equal(await auth.sessionToken(), null);
    auth.receiveToken(SESSION);
    // A new request is not answered by the late reply above.
    assert.equal(await auth.sessionToken(), null);
  });
});
