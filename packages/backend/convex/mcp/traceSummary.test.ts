import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildResourceTrace,
  buildToolTrace,
  sanitizeTraceJson,
  TRACE_ARGS_MAX_CHARS,
  TRACE_RESULT_IDS_MAX,
  TRACE_SUMMARY_MAX_CHARS,
} from "./traceSummary";

const cutResultSchema = z.object({
  content: z.string(),
  tags: z.array(z.string()),
});

describe("buildToolTrace summaries", () => {
  it("formats memory_retrieve with hit count and top title", () => {
    const trace = buildToolTrace(
      "memory_retrieve",
      { query: "convex bandwidth" },
      {
        ok: true,
        data: {
          memories: [
            { id: "m1", title: "Bounded memory list" },
            { id: "m2", title: "Usage counters" },
          ],
        },
      },
    );
    expect(trace.summary).toBe(
      'memory_retrieve "convex bandwidth" → 2 hits (top: "Bounded memory list")',
    );
    expect(trace.resultCount).toBe(2);
    expect(trace.resultIds).toEqual(["m1", "m2"]);
  });

  it("formats memory_add as added or deduped", () => {
    const added = buildToolTrace(
      "memory_add",
      { title: "Prefers pnpm", content: "uses pnpm" },
      { ok: true, data: { id: "m1", title: "Prefers pnpm" } },
    );
    expect(added.summary).toBe('memory_add → added "Prefers pnpm"');
    expect(added.resultIds).toEqual(["m1"]);

    const deduped = buildToolTrace(
      "memory_add",
      { title: "Prefers pnpm", content: "uses pnpm" },
      { ok: true, data: { id: "m1", title: "Prefers pnpm", deduped: true } },
    );
    expect(deduped.summary).toBe('memory_add → deduped "Prefers pnpm"');
  });

  it("formats memory_add_batch and context_pack", () => {
    expect(
      buildToolTrace(
        "memory_add_batch",
        { items: [] },
        {
          ok: true,
          data: {
            created: [
              { id: "a", title: "A" },
              { id: "b", title: "B", deduped: true },
            ],
            failed: [{ index: 2, error: "bad" }],
          },
        },
      ).summary,
    ).toBe("memory_add_batch → 1 added, 1 deduped, 1 failed");

    expect(
      buildToolTrace(
        "context_pack",
        { task: "fix build" },
        {
          ok: true,
          data: { memoryIds: ["m1"], skillNames: ["ship", "stage"] },
        },
      ).summary,
    ).toBe('context_pack "fix build" → 1 memory, 2 skills');
  });

  it("falls back to a generic line with the first label arg", () => {
    expect(
      buildToolTrace("files_list", { path: "docs" }, { ok: true, data: [] })
        .summary,
    ).toBe('files_list "docs" → 0 results');
    expect(
      buildToolTrace("ping", {}, { ok: true, data: { ok: true } }).summary,
    ).toBe("ping");
  });

  it("records errors with ok-false text and no result ids", () => {
    const trace = buildToolTrace(
      "memory_get",
      { id: "m9" },
      { ok: false, error: "Memory not found" },
    );
    expect(trace.summary).toBe('memory_get "m9" → error: Memory not found');
    expect(trace.error).toBe("Memory not found");
    expect(trace.resultIds).toEqual([]);
    expect(trace.resultPreview).toBeUndefined();
  });

  it("caps the summary at 140 chars", () => {
    const trace = buildToolTrace(
      "memory_get",
      { id: "m9" },
      { ok: false, error: "x".repeat(400) },
    );
    expect(trace.summary.length).toBe(TRACE_SUMMARY_MAX_CHARS);
    expect(trace.summary.endsWith("…")).toBe(true);
  });

  it("takes the profile hint from args, then the result", () => {
    expect(
      buildToolTrace(
        "memory_search",
        { profileId: "p_args" },
        { ok: true, data: { memories: [], profileId: "p_result" } },
      ).profileIdHint,
    ).toBe("p_args");
    expect(
      buildToolTrace(
        "memory_add_batch",
        { items: [] },
        { ok: true, data: { created: [], failed: [], profileId: "p_result" } },
      ).profileIdHint,
    ).toBe("p_result");
  });
});

describe("result ids", () => {
  it("dedupes and caps ids at 20", () => {
    const memories = Array.from({ length: 30 }, (_, i) => ({
      id: `m${i % 25}`,
      title: `t${i}`,
    }));
    const trace = buildToolTrace(
      "memory_search",
      { query: "q" },
      { ok: true, data: { memories } },
    );
    expect(trace.resultIds).toHaveLength(TRACE_RESULT_IDS_MAX);
    expect(new Set(trace.resultIds).size).toBe(TRACE_RESULT_IDS_MAX);
    expect(trace.resultIds[0]).toBe("m0");
  });

  it("uses skill names and ignores rows without ids", () => {
    const trace = buildToolTrace(
      "skills_list",
      {},
      {
        ok: true,
        data: { skills: [{ name: "ship" }, { description: "no name" }] },
      },
    );
    expect(trace.resultIds).toEqual(["ship"]);
    expect(trace.resultCount).toBe(2);
  });

  it("formats artifact tools without bodies", () => {
    const list = buildToolTrace(
      "artifacts_list",
      { type: "quiz" },
      {
        ok: true,
        data: {
          artifacts: [
            { id: "a1", title: "Quiz 1" },
            { id: "a2", title: "Quiz 2" },
          ],
          nextCursor: null,
        },
      },
    );
    expect(list.summary).toBe("artifacts_list → 2 artifacts");
    expect(list.resultIds).toEqual(["a1", "a2"]);

    const search = buildToolTrace(
      "artifacts_search",
      { query: "convex" },
      { ok: true, data: [{ id: "a1", title: "Convex notes" }] },
    );
    expect(search.summary).toBe('artifacts_search "convex" → 1 result');

    const get = buildToolTrace(
      "artifacts_get",
      { id: "a1", maxChars: 10 },
      {
        ok: true,
        data: {
          id: "a1",
          title: "Report",
          version: 3,
          bodyChars: 1200,
          truncated: true,
          body: "<h1>secret report</h1>",
        },
      },
    );
    expect(get.summary).toBe('artifacts_get "Report" → v3, 1200 chars');
    expect(get.resultPreview).not.toContain("secret report");
    expect(
      buildToolTrace("artifacts_get", { id: "a9" }, { ok: true, data: null })
        .summary,
    ).toBe('artifacts_get "a9" → not found');

    const save = buildToolTrace(
      "artifacts_save",
      { title: "Plan", type: "document", format: "html", body: "<p>hi</p>" },
      { ok: true, data: { id: "a3", created: true } },
    );
    expect(save.summary).toBe('artifacts_save "Plan" → saved');
    expect(save.args).toBe(
      '{"title":"Plan","type":"document","format":"html"}',
    );
    expect(save.resultIds).toEqual(["a3"]);

    expect(
      buildToolTrace(
        "artifacts_update",
        { id: "a3", body: "<p>new</p>" },
        { ok: true, data: { id: "a3", version: 2, versioned: true } },
      ).summary,
    ).toBe('artifacts_update "a3" → v2');
  });

  it("tolerates results with unexpected shapes", () => {
    const trace = buildToolTrace(
      "settings_get",
      {},
      { ok: true, data: { memories: "not an array", id: 5 } },
    );
    expect(trace.resultIds).toEqual([]);
    expect(trace.resultCount).toBeUndefined();
  });
});

describe("sanitizeTraceJson", () => {
  it("drops secret-looking keys and inline file and artifact bodies", () => {
    const json = sanitizeTraceJson(
      {
        path: "a.png",
        body: "<html>artifact</html>",
        contentBase64: "iVBORw0KGgo",
        apiKey: "k",
        api_key: "k",
        authorization: "Bearer x",
        nested: { accessToken: "t", password: "p", clientSecret: "s", ok: 1 },
      },
      TRACE_ARGS_MAX_CHARS,
    );
    expect(json).toBe('{"path":"a.png","nested":{"ok":1}}');
  });

  it("redacts secret-looking string values", () => {
    const json = sanitizeTraceJson(
      {
        note: "vmem_sk_abc",
        url: "data:image/png;base64,AAAA",
        header: "Bearer abc",
        plain: "sk-learn tips",
      },
      TRACE_ARGS_MAX_CHARS,
    );
    expect(json).toBe(
      '{"note":"[redacted]","url":"[redacted]","header":"[redacted]","plain":"sk-learn tips"}',
    );
  });

  it("cuts strings to 200 chars and arrays to 20 items", () => {
    const json = sanitizeTraceJson(
      { content: "c".repeat(500), tags: Array.from({ length: 30 }, String) },
      10_000,
    );
    const parsed = cutResultSchema.parse(JSON.parse(json));
    expect(parsed.content).toHaveLength(200);
    expect(parsed.content.endsWith("…")).toBe(true);
    expect(parsed.tags).toHaveLength(20);
  });

  it("caps the total size", () => {
    const items = Array.from({ length: 20 }, () => ({
      title: "t".repeat(200),
      content: "c".repeat(200),
    }));
    const json = sanitizeTraceJson({ items }, TRACE_ARGS_MAX_CHARS);
    expect(json).toHaveLength(TRACE_ARGS_MAX_CHARS);
  });

  it("sanitises tool args and result previews in buildToolTrace", () => {
    const trace = buildToolTrace(
      "files_upload",
      { path: "cat.png", contentBase64: "iVBORw0KGgo".repeat(100) },
      {
        ok: true,
        data: { path: "cat.png", contentBase64: "AAAA", size: 3 },
      },
    );
    expect(trace.args).toBe('{"path":"cat.png"}');
    expect(trace.resultPreview).toBe('{"path":"cat.png","size":3}');
  });
});

describe("buildResourceTrace", () => {
  it("summarises reads and errors", () => {
    const ok = buildResourceTrace("vmem://context_prompt", {
      ok: true,
      text: "# Profile",
    });
    expect(ok.summary).toBe("resource:vmem://context_prompt → 9 chars");
    expect(ok.resultPreview).toBe("# Profile");

    const failed = buildResourceTrace("vmem://context_prompt", {
      ok: false,
      error: "boom",
    });
    expect(failed.summary).toBe("resource:vmem://context_prompt → error: boom");
    expect(failed.error).toBe("boom");
  });
});
