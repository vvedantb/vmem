import { describe, expect, it } from "vitest";
import {
  buildPeriodRollupBody,
  buildRollupBody,
  estimateTokens,
  groupActivityByProfile,
  HIGHLIGHTS_MAX,
  MEMORY_IDS_MAX,
  parseRollupReply,
  rollupStats,
  SUMMARY_MAX_CHARS,
  TRACE_DIGEST_MAX_LINES,
  traceDigest,
  unionMemoryIds,
  type RollupMemoryInput,
  type RollupSourceInput,
  type RollupTraceInput,
} from "../../engine/memory/rollupPrompt";
import {
  dayWindow,
  utcDayKey,
  yesterdayDayKey,
} from "../../engine/memory/rollupPeriod";

const DAY = dayWindow("2026-10-19");

function memory(
  id: string,
  overrides: Partial<RollupMemoryInput> = {},
): RollupMemoryInput {
  return {
    memoryId: id,
    profileId: "p1",
    title: `title ${id}`,
    content: `content ${id}`,
    source: "mcp",
    status: "active",
    createdAt: DAY.startMs + 1000,
    updatedAt: DAY.startMs + 1000,
    isFile: false,
    ...overrides,
  };
}

function trace(
  tool: string,
  summary: string,
  overrides: Partial<RollupTraceInput> = {},
): RollupTraceInput {
  return { tool, ok: true, summary, profileId: "p1", ...overrides };
}

describe("rollupPeriod", () => {
  it("keys and windows a utc day", () => {
    expect(DAY.endMs - DAY.startMs).toBe(86_400_000);
    expect(utcDayKey(DAY.startMs)).toBe("2026-10-19");
    expect(utcDayKey(DAY.endMs - 1)).toBe("2026-10-19");
    expect(yesterdayDayKey(Date.parse("2026-10-20T02:30:00Z"))).toBe(
      "2026-10-19",
    );
  });

  it("rejects malformed and impossible day keys", () => {
    expect(() => dayWindow("2026-10-1")).toThrow("Invalid day key");
    expect(() => dayWindow("2026-02-30")).toThrow("Invalid day key");
    expect(() => dayWindow("yesterday")).toThrow("Invalid day key");
  });
});

describe("groupActivityByProfile", () => {
  it("groups by profile and sends unscoped rows to the fallback", () => {
    const groups = groupActivityByProfile(
      {
        memories: [
          memory("a"),
          memory("b", { profileId: "p2" }),
          memory("c", { profileId: undefined }),
        ],
        traces: [trace("memory_retrieve", "x", { profileId: undefined })],
      },
      "p1",
    );
    expect([...groups.keys()].sort()).toEqual(["p1", "p2"]);
    expect(groups.get("p1")?.memories.map((m) => m.memoryId)).toEqual([
      "a",
      "c",
    ]);
    expect(groups.get("p1")?.traces).toHaveLength(1);
    expect(groups.get("p2")?.memories.map((m) => m.memoryId)).toEqual(["b"]);
  });

  it("drops unscoped rows without a fallback", () => {
    const groups = groupActivityByProfile(
      { memories: [memory("c", { profileId: undefined })], traces: [] },
      undefined,
    );
    expect(groups.size).toBe(0);
  });
});

describe("rollupStats", () => {
  it("splits created from updated and counts suppressed and tool calls", () => {
    const stats = rollupStats(
      {
        memories: [
          memory("new"),
          memory("old", { createdAt: DAY.startMs - 5000 }),
          memory("gone", {
            createdAt: DAY.startMs - 5000,
            status: "suppressed",
          }),
        ],
        traces: [trace("a", "1"), trace("b", "2")],
      },
      DAY,
    );
    expect(stats).toEqual({
      created: 1,
      updated: 2,
      suppressed: 1,
      toolCalls: 2,
    });
  });
});

describe("buildRollupBody", () => {
  const stats = { created: 0, updated: 0, suppressed: 0, toolCalls: 0 };

  it("sorts memories by usefulness and cuts snippets near 300 chars", () => {
    const { body, memoryIds } = buildRollupBody({
      dayKey: "2026-10-19",
      startMs: DAY.startMs,
      stats,
      activity: {
        memories: [
          memory("low", { usefulnessScore: 0.1 }),
          memory("high", {
            usefulnessScore: 0.9,
            content: "word ".repeat(200),
          }),
          memory("edited", {
            usefulnessScore: 0.5,
            createdAt: DAY.startMs - 1,
          }),
        ],
        traces: [],
      },
    });
    expect(memoryIds).toEqual(["high", "edited", "low"]);
    expect(body).toContain("# Day 2026-10-19 (UTC)");
    expect(body).toContain("[edited] title edited (updated):");
    const highLine = body.split("\n").find((l) => l.startsWith("- [high]"));
    expect(highLine).toBeDefined();
    expect((highLine ?? "").length).toBeLessThan(340);
  });

  it("shows connector, file and browsing rows as counts and titles only", () => {
    const { body, memoryIds } = buildRollupBody({
      dayKey: "2026-10-19",
      startMs: DAY.startMs,
      stats,
      activity: {
        memories: [
          memory("note"),
          ...Array.from({ length: 12 }, (_, i) =>
            memory(`g${i}`, {
              source: "gmail",
              sourceType: "gmail",
              content: "SECRET MAIL BODY",
            }),
          ),
          memory("f", { isFile: true, source: "upload", title: "report.pdf" }),
          memory("h", { source: "browsing-history", title: "Convex docs" }),
        ],
        traces: [],
      },
    });
    expect(memoryIds).toEqual(["note"]);
    expect(body).toContain("- gmail: 12 items — ");
    expect(body).toContain('- files: 1 items — "report.pdf"');
    expect(body).toContain('- browsing-history: 1 items — "Convex docs"');
    expect(body).not.toContain("SECRET MAIL BODY");
    expect(body).not.toContain("[g0]");
    // five titles per source at most
    expect(body).toContain('"title g4"');
    expect(body).not.toContain('"title g5"');
  });

  it("stops adding memories at the token cap", () => {
    const memories = Array.from({ length: 200 }, (_, i) =>
      memory(`m${i}`, { content: "lorem ipsum ".repeat(40) }),
    );
    const { body, memoryIds } = buildRollupBody({
      dayKey: "2026-10-19",
      startMs: DAY.startMs,
      stats,
      activity: { memories, traces: [] },
      tokenCap: 2_000,
    });
    expect(memoryIds.length).toBeGreaterThan(0);
    expect(memoryIds.length).toBeLessThan(200);
    expect(estimateTokens(body)).toBeLessThanOrEqual(2_000);
  });

  it("stays under the default 8k cap with 200 full rows", () => {
    const memories = Array.from({ length: 200 }, (_, i) =>
      memory(`m${i}`, { content: "x ".repeat(400) }),
    );
    const { body } = buildRollupBody({
      dayKey: "2026-10-19",
      startMs: DAY.startMs,
      stats,
      activity: { memories, traces: [] },
    });
    expect(estimateTokens(body)).toBeLessThanOrEqual(8_000);
  });

  it("adds a tool call digest", () => {
    const { body } = buildRollupBody({
      dayKey: "2026-10-19",
      startMs: DAY.startMs,
      stats,
      activity: {
        memories: [],
        traces: [
          trace("memory_retrieve", "convex bandwidth"),
          trace("memory_retrieve", "convex bandwidth"),
          trace("memory_retrieve", "pnpm", { ok: false }),
          trace("memory_store", "Prefers pnpm"),
        ],
      },
    });
    expect(body).toContain("# Tool calls");
    expect(body).toContain(
      "- memory_retrieve ×3 (1 failed): 'convex bandwidth', 'pnpm'",
    );
    expect(body).toContain("- memory_store ×1: 'Prefers pnpm'");
    expect(body).not.toContain("# Memories");
  });
});

describe("traceDigest", () => {
  it("keeps at most 40 lines, busiest tool first", () => {
    const traces = Array.from({ length: 60 }, (_, i) =>
      trace(`tool_${i}`, "s"),
    );
    traces.push(trace("tool_7", "again"));
    const lines = traceDigest(traces);
    expect(lines).toHaveLength(TRACE_DIGEST_MAX_LINES);
    expect(lines[0]).toBe("- tool_7 ×2: 's', 'again'");
  });
});

describe("parseRollupReply", () => {
  const allowed = new Set(["m1", "m2"]);

  it("parses the reply and drops ids that were not in the input", () => {
    const parsed = parseRollupReply(
      '```json\n{"summary":"You fixed the build.","highlights":["Fixed build"],"memoryIds":["m1","fake","m1","m2"]}\n```',
      allowed,
    );
    expect(parsed).toEqual({
      summary: "You fixed the build.",
      highlights: ["Fixed build"],
      memoryIds: ["m1", "m2"],
    });
  });

  it("caps summary, highlights and ids", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `id${i}`);
    const parsed = parseRollupReply(
      JSON.stringify({
        summary: "word ".repeat(600),
        highlights: Array.from({ length: 12 }, (_, i) => `h${i}`),
        memoryIds: ids,
      }),
      new Set(ids),
    );
    expect(parsed?.summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(parsed?.highlights).toHaveLength(HIGHLIGHTS_MAX);
    expect(parsed?.memoryIds).toHaveLength(MEMORY_IDS_MAX);
  });

  it("tolerates bad highlights and ids but needs a summary", () => {
    expect(
      parseRollupReply(
        '{"summary":"ok","highlights":"x","memoryIds":3}',
        allowed,
      ),
    ).toEqual({ summary: "ok", highlights: [], memoryIds: [] });
    expect(parseRollupReply('{"summary":"  "}', allowed)).toBeNull();
    expect(parseRollupReply('{"highlights":[]}', allowed)).toBeNull();
    expect(parseRollupReply("not json at all", allowed)).toBeNull();
  });
});

function source(
  periodKey: string,
  overrides: Partial<RollupSourceInput> = {},
): RollupSourceInput {
  return {
    period: "day",
    periodKey,
    startMs: overrides.startMs ?? dayWindow(periodKey).startMs,
    summary: `summary ${periodKey}`,
    highlights: [`highlight ${periodKey}`],
    memoryIds: [`m_${periodKey}`],
    stats: { created: 2, updated: 1, suppressed: 1, toolCalls: 4 },
    ...overrides,
  };
}

describe("unionMemoryIds", () => {
  it("takes ids rank by rank across sources, deduped, capped", () => {
    const sources = [
      source("2026-10-19", { memoryIds: ["a1", "a2", "a3"] }),
      source("2026-10-20", { memoryIds: ["b1", "a1"] }),
      source("2026-10-21", { memoryIds: [] }),
    ];
    expect(unionMemoryIds(sources)).toEqual(["a1", "b1", "a2", "a3"]);
    expect(unionMemoryIds(sources, 3)).toEqual(["a1", "b1", "a2"]);
  });

  it("keeps at most MEMORY_IDS_MAX, with ids from every source", () => {
    const sources = ["19", "20", "21", "22", "23", "24", "25"].map((d) =>
      source(`2026-10-${d}`, {
        memoryIds: Array.from({ length: 30 }, (_, i) => `d${d}_${i}`),
      }),
    );
    const ids = unionMemoryIds(sources);
    expect(ids).toHaveLength(MEMORY_IDS_MAX);
    for (const d of ["19", "25"]) expect(ids).toContain(`d${d}_0`);
  });
});

describe("buildPeriodRollupBody", () => {
  it("lists sources in time order with summaries and highlights only", () => {
    const { body, memoryIds, stats } = buildPeriodRollupBody({
      period: "month",
      periodKey: "2026-10",
      sources: [
        source("2026-10-26"),
        source("2026-W41", {
          period: "week",
          startMs: dayWindow("2026-10-05").startMs,
        }),
        source("2026-10-01"),
      ],
    });
    expect(body.split("\n")).toEqual([
      "# Month 2026-10 (UTC)",
      "Created 6, updated 3, suppressed 3, tool calls 12.",
      "",
      "## Day 2026-10-01",
      "summary 2026-10-01",
      "- highlight 2026-10-01",
      "",
      "## Week 2026-W41",
      "summary 2026-W41",
      "- highlight 2026-W41",
      "",
      "## Day 2026-10-26",
      "summary 2026-10-26",
      "- highlight 2026-10-26",
    ]);
    expect(memoryIds).toEqual(["m_2026-10-01", "m_2026-W41", "m_2026-10-26"]);
    expect(stats).toEqual({
      created: 6,
      updated: 3,
      suppressed: 3,
      toolCalls: 12,
    });
    // ids are not shown to the model
    expect(body).not.toContain("m_2026");
  });

  it("titles a week", () => {
    const { body } = buildPeriodRollupBody({
      period: "week",
      periodKey: "2026-W43",
      sources: [source("2026-10-19")],
    });
    expect(body.startsWith("# Week 2026-W43 (UTC)")).toBe(true);
  });
});
