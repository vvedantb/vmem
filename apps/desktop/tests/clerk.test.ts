import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FALLBACK_PUBLISHABLE_KEY,
  frontendApiHost,
  isRendererUrl,
  publishableKey,
  RENDERER_URL,
  sessionIssuer,
} from "../src/clerk";

describe("sign-in instance", () => {
  it("defaults to the Project V production instance", () => {
    assert.equal(FALLBACK_PUBLISHABLE_KEY, "pk_live_Y2xlcmsucHJvamVjdHYudWsk");
    assert.equal(publishableKey(undefined), FALLBACK_PUBLISHABLE_KEY);
    assert.equal(publishableKey(""), FALLBACK_PUBLISHABLE_KEY);
    assert.equal(
      frontendApiHost(FALLBACK_PUBLISHABLE_KEY),
      "clerk.projectv.uk",
    );
    assert.equal(
      sessionIssuer(FALLBACK_PUBLISHABLE_KEY),
      "https://clerk.projectv.uk",
    );
  });

  it("lets VITE_CLERK_PUBLISHABLE_KEY override it", () => {
    const dev = `pk_test_${btoa("allowing-coyote-80.clerk.accounts.dev$")}`;
    assert.equal(publishableKey(dev), dev);
    assert.equal(frontendApiHost(dev), "allowing-coyote-80.clerk.accounts.dev");
  });
});

describe("renderer origin", () => {
  it("is vmem://renderer/", () => {
    assert.equal(RENDERER_URL, "vmem://renderer/");
    assert.equal(isRendererUrl(RENDERER_URL), true);
    assert.equal(isRendererUrl("vmem://renderer"), true);
    assert.equal(isRendererUrl("vmem://renderer/index.html#/factor-one"), true);
  });

  it("rejects other schemes and hosts", () => {
    for (const url of [
      "bee://renderer/",
      "vmem://team/ABC",
      "https://renderer/",
      "file:///renderer/index.html",
      "not a url",
    ]) {
      assert.equal(isRendererUrl(url), false, url);
    }
  });
});
