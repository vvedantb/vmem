/**
 * Packaged integration test (Linux). Run it inside a display, for example
 * `xvfb-run -a node scripts/packaged-test.mjs`. It needs `openbox` and `xterm`.
 *
 * Starts a window manager, an xterm with a known title and a mock vmem API,
 * then runs the packaged binary with VMEM_DESKTOP_PACKAGED_TEST=1. The test
 * passes only if the app records a focus event for that window and posts a
 * desktop memory about it to the mock.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

const binary = resolve(
  process.argv[2] ??
    resolve(import.meta.dirname, "../release/linux-unpacked/vmem-desktop"),
);
const TITLE = "vmem-packaged-test-window";
const TIMEOUT_MS = 60_000;

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

const postSchema = z.object({
  title: z.string(),
  content: z.string(),
  source: z.string(),
  sourceType: z.string(),
});
const eventsSchema = z.array(
  z.object({ kind: z.string(), title: z.string().optional() }),
);

const posts = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += String(chunk)));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/api/v1/memories") {
      posts.push(postSchema.parse(JSON.parse(body)));
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(memoryResponse));
  });
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const { port } = server.address();

const helpers = [];
const userData = await mkdtemp(join(tmpdir(), "vmem-desktop-test-"));

function fail(message) {
  throw new Error(message);
}

try {
  if (!process.env.DISPLAY) fail("DISPLAY is not set. Run under xvfb-run.");
  helpers.push(spawn("openbox", [], { stdio: "ignore" }));
  await new Promise((ok) => setTimeout(ok, 1000));
  helpers.push(
    spawn("xterm", ["-T", TITLE, "-e", "sleep", "300"], { stdio: "ignore" }),
  );
  await new Promise((ok) => setTimeout(ok, 2000));

  const app = spawn(binary, ["--no-sandbox", `--user-data-dir=${userData}`], {
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env,
      VMEM_DESKTOP_PACKAGED_TEST: "1",
      VMEM_API_KEY: "vmem_sk_test",
      VMEM_BASE_URL: `http://127.0.0.1:${port}`,
    },
  });
  helpers.push(app);
  let stdout = "";
  app.stdout.on("data", (chunk) => (stdout += String(chunk)));
  const code = await new Promise((ok) => {
    const timer = setTimeout(() => ok("timeout"), TIMEOUT_MS);
    app.on("exit", (exitCode) => {
      clearTimeout(timer);
      ok(exitCode);
    });
  });

  if (code !== 0) fail(`Packaged app exited with ${String(code)}.`);
  if (!stdout.includes("VMEM_DESKTOP_PACKAGED_TEST_OK")) {
    fail("Packaged app did not print VMEM_DESKTOP_PACKAGED_TEST_OK.");
  }

  const events = eventsSchema.parse(
    JSON.parse(await readFile(join(userData, "events.json"), "utf8")),
  );
  const focus = events.filter((e) => e.kind === "focus");
  if (!focus.some((e) => e.title?.includes(TITLE))) {
    fail(
      `events.json has no focus event for "${TITLE}": ${JSON.stringify(events)}`,
    );
  }

  const memory = posts.find(
    (p) => p.source === "desktop" && p.sourceType === "desktop",
  );
  if (memory === undefined) fail("Mock got no desktop memory POST.");
  if (!`${memory.title}\n${memory.content}`.includes(TITLE)) {
    fail(
      `Posted memory does not mention the window: ${JSON.stringify(memory)}`,
    );
  }
  console.info(`PACKAGED_TEST_OK ${JSON.stringify({ title: memory.title })}`);
} finally {
  for (const child of helpers) child.kill("SIGKILL");
  server.close();
  await rm(userData, { recursive: true, force: true });
}
