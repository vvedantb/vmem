import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { describe, it } from "node:test";
import { z } from "zod";
import { defaultSettings } from "../src/settings-schema";
import { summarise } from "../src/summarise";
import {
  createPoster,
  resolveBaseUrl,
  resolveClientConfig,
} from "../src/vmem-client";

const memoryResponse = {
  data: {
    id: "mem_1",
    userId: "u",
    profileId: "p",
    title: "t",
    content: "c",
    type: "episodic",
    source: "desktop",
    sourceType: "desktop",
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: 0.9,
    status: "active",
    createdAt: "2026-01-05T10:00:00.000Z",
    updatedAt: "2026-01-05T10:00:00.000Z",
    expiresAt: null,
    tags: ["desktop"],
  },
};

const portSchema = z.object({ port: z.number() });

const postedBodySchema = z.object({
  title: z.string(),
  content: z.string(),
  type: z.string(),
  source: z.string(),
  sourceType: z.string(),
  tags: z.array(z.string()),
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += String(chunk)));
    req.on("end", () => resolve(body));
  });
}

describe("vmem client", () => {
  it("posts a summarised desktop memory to /api/v1/memories", async () => {
    const seen: {
      method?: string;
      url?: string;
      auth?: string;
      body: string;
    }[] = [];
    const server = createServer((req, res) => {
      void readBody(req).then((body) => {
        seen.push({
          method: req.method,
          url: req.url,
          auth: req.headers.authorization,
          body,
        });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(memoryResponse));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const { port } = portSchema.parse(server.address());
      const config = resolveClientConfig(defaultSettings(), {
        VMEM_API_KEY: "vmem_sk_test",
        VMEM_BASE_URL: `http://127.0.0.1:${String(port)}`,
      });
      assert.ok(config);

      const t0 = Date.UTC(2026, 0, 5, 10, 0, 0);
      const { memories } = summarise(
        [
          {
            kind: "focus",
            at: t0,
            app: "Code",
            title: "search.ts - vmem - Code",
          },
          { kind: "gap", at: t0 + 45 * 60_000, reason: "idle" },
        ],
        { endMs: t0 + 60 * 60_000 },
      );
      const draft = memories[0];
      assert.ok(draft);
      await createPoster(config)(draft);

      assert.equal(seen.length, 1);
      assert.equal(seen[0]?.method, "POST");
      assert.equal(seen[0]?.url, "/api/v1/memories");
      assert.equal(seen[0]?.auth, "Bearer vmem_sk_test");
      const body = postedBodySchema.parse(JSON.parse(seen[0]?.body ?? ""));
      assert.equal(body.source, "desktop");
      assert.equal(body.sourceType, "desktop");
      assert.equal(body.type, "episodic");
      assert.ok(body.tags.includes("desktop"));
      assert.equal(body.title, "Worked in Code on search.ts - vmem for 45 min");
      assert.match(body.content, /Focus time: 45 min/);
    } finally {
      server.close();
    }
  });
});

describe("resolveClientConfig", () => {
  const prod = "https://clear-bear-690.eu-west-1.convex.site";

  it("returns null with no key and no sign-in", () => {
    assert.equal(resolveClientConfig(defaultSettings(), {}), null);
    assert.equal(resolveClientConfig(defaultSettings(), {}, null), null);
  });

  it("uses a saved API key until the user signs in", () => {
    const settings = { ...defaultSettings(), apiKey: "saved" };
    assert.deepEqual(resolveClientConfig(settings, {}), {
      apiKey: "saved",
      baseUrl: prod,
    });
  });

  it("prefers the OAuth access token over a saved key", () => {
    const settings = { ...defaultSettings(), apiKey: "saved" };
    assert.deepEqual(resolveClientConfig(settings, {}, "clerk-access"), {
      apiKey: "clerk-access",
      baseUrl: prod,
    });
  });

  it("lets VMEM_API_KEY win over everything", () => {
    const settings = { ...defaultSettings(), apiKey: "saved" };
    assert.equal(
      resolveClientConfig(settings, { VMEM_API_KEY: "env" }, "clerk-access")
        ?.apiKey,
      "env",
    );
  });

  it("lets VMEM_BASE_URL override the production host", () => {
    const config = resolveClientConfig(
      defaultSettings(),
      { VMEM_BASE_URL: "http://127.0.0.1:1234" },
      "clerk-access",
    );
    assert.equal(config?.baseUrl, "http://127.0.0.1:1234");
    assert.equal(resolveBaseUrl({}), prod);
  });

  it("posts the OAuth access token as the Bearer token", async () => {
    const auths: (string | undefined)[] = [];
    const server = createServer((req, res) => {
      void readBody(req).then(() => {
        auths.push(req.headers.authorization);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(memoryResponse));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const { port } = portSchema.parse(server.address());
      const config = resolveClientConfig(
        { ...defaultSettings(), apiKey: "saved" },
        { VMEM_BASE_URL: `http://127.0.0.1:${String(port)}` },
        "clerk-access",
      );
      assert.ok(config);
      await createPoster(config)({
        title: "t",
        content: "c",
        tags: [],
      });
      assert.deepEqual(auths, ["Bearer clerk-access"]);
    } finally {
      server.close();
    }
  });
});
