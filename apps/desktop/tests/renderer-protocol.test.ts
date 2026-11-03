import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { FALLBACK_PUBLISHABLE_KEY } from "../src/clerk";
import {
  createRendererHandler,
  rendererCsp,
  rendererFile,
} from "../src/renderer-protocol";

const dir = mkdtempSync(join(tmpdir(), "vmem-renderer-"));

describe("rendererCsp", () => {
  it("allows the instance's Frontend API host for scripts and requests", () => {
    const csp = rendererCsp(FALLBACK_PUBLISHABLE_KEY);
    assert.match(
      csp,
      /script-src 'self' 'unsafe-inline' https:\/\/clerk\.projectv\.uk https:\/\/challenges\.cloudflare\.com;/,
    );
    assert.match(csp, /connect-src 'self' https:\/\/clerk\.projectv\.uk;/);
    assert.match(csp, /^default-src 'self';/);
    assert.doesNotMatch(csp, /unsafe-eval/);
  });
});

describe("rendererFile", () => {
  it("maps / to index.html and other paths inside the renderer folder", () => {
    assert.equal(
      rendererFile(dir, new URL("vmem://renderer/")),
      join(dir, "index.html"),
    );
    assert.equal(
      rendererFile(dir, new URL("vmem://renderer/assets/a%20b.js")),
      join(dir, "assets", "a b.js"),
    );
  });

  it("refuses paths that leave the renderer folder or do not decode", () => {
    for (const path of [
      "/..%2Fsecret",
      "/..%2F..%2Fetc%2Fpasswd",
      "/%E0%A4%A",
    ]) {
      assert.equal(
        rendererFile(dir, new URL(`vmem://renderer${path}`)),
        null,
        path,
      );
    }
  });
});

describe("createRendererHandler", () => {
  it("serves the file with the CSP header", async () => {
    const fetched: string[] = [];
    const handler = createRendererHandler({
      rendererDir: dir,
      publishableKey: FALLBACK_PUBLISHABLE_KEY,
      fetchFile: async (url) => {
        fetched.push(url);
        return new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        });
      },
    });
    const response = await handler(new Request("vmem://renderer/"));
    assert.deepEqual(fetched, [
      pathToFileURL(join(dir, "index.html")).toString(),
    ]);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html");
    assert.equal(
      response.headers.get("content-security-policy"),
      rendererCsp(FALLBACK_PUBLISHABLE_KEY),
    );
    assert.equal(await response.text(), "<html></html>");
  });

  it("answers 404 with the CSP header and reads nothing for a path outside", async () => {
    let reads = 0;
    const handler = createRendererHandler({
      rendererDir: dir,
      publishableKey: FALLBACK_PUBLISHABLE_KEY,
      fetchFile: async () => {
        reads += 1;
        return new Response("");
      },
    });
    const response = await handler(new Request("vmem://renderer/..%2F..%2Fx"));
    assert.equal(response.status, 404);
    assert.ok(response.headers.get("content-security-policy"));
    assert.equal(reads, 0);
  });
});
