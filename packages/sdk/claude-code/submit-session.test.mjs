import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { objectSchema } from "./schemas.mjs";
import { sessionTitle, submitSession } from "./submit-session.mjs";

const env = {
  VMEM_API_KEY: "vmem_sk_test",
  VMEM_BASE_URL: "https://example.convex.site/",
};

/** @param {number} userTurns */
function transcriptJsonl(userTurns) {
  return Array.from({ length: userTurns }, (_, index) =>
    JSON.stringify({
      type: "user",
      message: { role: "user", content: `turn ${index} password=hunter2pass` },
    }),
  ).join("\n");
}

/** @param {(dir: string) => Promise<void>} run */
async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "vmem-hook-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A fake fetch that records each call. No network. */
function fakeFetch(status = 201) {
  /** @type {{ url: string; init: RequestInit | undefined }[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (url, init) => {
    calls.push({
      url: url instanceof Request ? url.url : url.toString(),
      init,
    });
    return new Response(JSON.stringify({ data: { id: "t1" } }), { status });
  };
  return { calls, fetchImpl };
}

void test("posts a redacted transcript once per session", async () => {
  await withTempDir(async (dir) => {
    const transcriptPath = join(dir, "s.jsonl");
    await writeFile(transcriptPath, transcriptJsonl(3));
    const payload = JSON.stringify({
      session_id: "abcdef123456",
      transcript_path: transcriptPath,
      cwd: "/work/vmem",
      hook_event_name: "SessionEnd",
      reason: "other",
    });
    const statePath = join(dir, "state.json");
    const { calls, fetchImpl } = fakeFetch();

    const first = await submitSession({ payload, env, statePath, fetchImpl });
    assert.match(first, /^submitted abcdef123456/u);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.url,
      "https://example.convex.site/api/v1/transcripts",
    );
    const sent = calls[0]?.init?.body;
    const body = objectSchema.parse(
      JSON.parse(typeof sent === "string" ? sent : ""),
    );
    assert.equal(body.title, "Claude Code · vmem · abcdef12");
    assert.equal(typeof body.transcript, "string");
    assert.match(String(body.transcript), /turn 2/u);
    assert.doesNotMatch(String(body.transcript), /hunter2pass/u);

    const second = await submitSession({ payload, env, statePath, fetchImpl });
    assert.match(second, /already submitted/u);
    assert.equal(calls.length, 1);
  });
});

void test("skips a short session and does not record a failed upload", async () => {
  await withTempDir(async (dir) => {
    const short = join(dir, "short.jsonl");
    await writeFile(short, transcriptJsonl(2));
    const statePath = join(dir, "state.json");
    const { calls, fetchImpl } = fakeFetch(500);
    const payloadFor = (/** @type {string} */ path) =>
      JSON.stringify({ session_id: "s1", transcript_path: path, cwd: "" });

    assert.match(
      await submitSession({
        payload: payloadFor(short),
        env,
        statePath,
        fetchImpl,
      }),
      /user turn/u,
    );
    assert.equal(calls.length, 0);

    const long = join(dir, "long.jsonl");
    await writeFile(long, transcriptJsonl(4));
    assert.match(
      await submitSession({
        payload: payloadFor(long),
        env,
        statePath,
        fetchImpl,
      }),
      /HTTP 500/u,
    );
    assert.match(
      await submitSession({
        payload: payloadFor(long),
        env,
        statePath,
        fetchImpl,
      }),
      /HTTP 500/u,
    );
  });
});

void test("skips when the env vars are missing", async () => {
  const { calls, fetchImpl } = fakeFetch();
  const out = await submitSession({ payload: "{}", env: {}, fetchImpl });
  assert.match(out, /VMEM_API_KEY/u);
  assert.equal(calls.length, 0);
});

void test("builds a short title", () => {
  assert.equal(sessionTitle("", "1234567890"), "Claude Code · 12345678");
});
