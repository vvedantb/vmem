/**
 * Day rollup prompt body and reply parsing. Pure: no Convex imports.
 * The instructions live in convex/prompts/rollup.ts; this builds the data
 * part under a token budget and checks the model reply.
 */
import { z } from "zod";
import { parseJsonString } from "../llm/extractJsonString";
import { truncateAtWord } from "../llm/truncateAtWord";
import { isLowPriorSource, sourcePrior } from "./usefulness";

export const MEMORY_SNIPPET_CHARS = 300;
export const ROLLUP_BODY_TOKEN_CAP = 8_000;
export const TRACE_DIGEST_MAX_LINES = 40;
export const SUMMARY_MAX_CHARS = 1_200;
export const HIGHLIGHTS_MAX = 8;
export const MEMORY_IDS_MAX = 30;

const TITLE_MAX_CHARS = 120;
const BULK_TITLES_PER_SOURCE = 5;
const BULK_TITLE_MAX_CHARS = 60;
const BULK_MAX_LINES = 12;
const TRACE_SAMPLES_PER_TOOL = 3;
const TRACE_SAMPLE_MAX_CHARS = 60;
const HIGHLIGHT_MAX_CHARS = 200;

export interface RollupMemoryInput {
  memoryId: string;
  profileId?: string;
  title: string;
  content: string;
  source: string;
  sourceType?: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  usefulnessScore?: number;
  isFile: boolean;
}

export interface RollupTraceInput {
  tool: string;
  ok: boolean;
  summary: string;
  profileId?: string;
}

export interface RollupActivity {
  memories: RollupMemoryInput[];
  traces: RollupTraceInput[];
}

export interface RollupStats {
  created: number;
  updated: number;
  suppressed: number;
  toolCalls: number;
}

/** ~4 chars a token; good enough for a budget, not for billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Rows and traces with no profile go to `fallbackProfileId`, else drop. */
export function groupActivityByProfile(
  activity: RollupActivity,
  fallbackProfileId: string | undefined,
): Map<string, RollupActivity> {
  const groups = new Map<string, RollupActivity>();
  const groupFor = (profileId: string | undefined) => {
    const key = profileId ?? fallbackProfileId;
    if (key === undefined) return undefined;
    let group = groups.get(key);
    if (!group) {
      group = { memories: [], traces: [] };
      groups.set(key, group);
    }
    return group;
  };
  for (const memory of activity.memories) {
    groupFor(memory.profileId)?.memories.push(memory);
  }
  for (const trace of activity.traces) {
    groupFor(trace.profileId)?.traces.push(trace);
  }
  return groups;
}

export function rollupStats(
  activity: RollupActivity,
  window: { startMs: number; endMs: number },
): RollupStats {
  const createdInWindow = (m: RollupMemoryInput) =>
    m.createdAt >= window.startMs && m.createdAt < window.endMs;
  return {
    created: activity.memories.filter(createdInWindow).length,
    updated: activity.memories.filter((m) => !createdInWindow(m)).length,
    suppressed: activity.memories.filter((m) => m.status === "suppressed")
      .length,
    toolCalls: activity.traces.length,
  };
}

/** Connector, file and browsing rows only show up as counts and titles. */
export function isBulkMemory(memory: RollupMemoryInput): boolean {
  return (
    memory.isFile ||
    memory.sourceType !== undefined ||
    isLowPriorSource(memory.source, memory.sourceType)
  );
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${truncateAtWord(flat, max - 1)}…` : flat;
}

function usefulness(memory: RollupMemoryInput): number {
  return (
    memory.usefulnessScore ?? sourcePrior(memory.source, memory.sourceType)
  );
}

function memoryLine(memory: RollupMemoryInput, startMs: number): string {
  const flags = [
    memory.createdAt < startMs ? "updated" : null,
    memory.status === "suppressed" ? "suppressed" : null,
  ].filter((flag) => flag !== null);
  const tag = flags.length > 0 ? ` (${flags.join(", ")})` : "";
  const snippet = clip(memory.content, MEMORY_SNIPPET_CHARS);
  return `- [${memory.memoryId}] ${clip(memory.title, TITLE_MAX_CHARS)}${tag}: ${snippet}`;
}

function bulkLines(bulk: RollupMemoryInput[]): string[] {
  const bySource = new Map<string, string[]>();
  for (const memory of bulk) {
    const label = memory.isFile
      ? "files"
      : (memory.sourceType ?? memory.source);
    bySource.set(label, [...(bySource.get(label) ?? []), memory.title]);
  }
  return [...bySource.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, BULK_MAX_LINES)
    .map(([label, titles]) => {
      const sample = titles
        .slice(0, BULK_TITLES_PER_SOURCE)
        .map((title) => `"${clip(title, BULK_TITLE_MAX_CHARS)}"`)
        .join("; ");
      return `- ${label}: ${titles.length} items — ${sample}`;
    });
}

/** One line per tool, busiest first, at most 40 lines. */
export function traceDigest(traces: readonly RollupTraceInput[]): string[] {
  const byTool = new Map<
    string,
    { count: number; failed: number; samples: string[] }
  >();
  for (const trace of traces) {
    const entry = byTool.get(trace.tool) ?? {
      count: 0,
      failed: 0,
      samples: [],
    };
    entry.count += 1;
    if (!trace.ok) entry.failed += 1;
    const sample = clip(trace.summary, TRACE_SAMPLE_MAX_CHARS);
    if (
      sample.length > 0 &&
      entry.samples.length < TRACE_SAMPLES_PER_TOOL &&
      !entry.samples.includes(sample)
    ) {
      entry.samples.push(sample);
    }
    byTool.set(trace.tool, entry);
  }
  return [...byTool.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TRACE_DIGEST_MAX_LINES)
    .map(([tool, { count, failed, samples }]) => {
      const failures = failed > 0 ? ` (${failed} failed)` : "";
      const quoted = samples.map((s) => `'${s}'`).join(", ");
      return `- ${tool} ×${count}${failures}${quoted ? `: ${quoted}` : ""}`;
    });
}

/**
 * Prompt data for one profile-day. Fixed parts (stats, other items, tool
 * calls) go in first; memories, most useful first, fill what is left of the
 * budget. `memoryIds` are the ids shown, so the only ids the reply may cite.
 */
export function buildRollupBody(args: {
  dayKey: string;
  startMs: number;
  activity: RollupActivity;
  stats: RollupStats;
  tokenCap?: number;
}): { body: string; memoryIds: string[] } {
  const cap = args.tokenCap ?? ROLLUP_BODY_TOKEN_CAP;
  const bulk = args.activity.memories.filter(isBulkMemory);
  const notes = args.activity.memories
    .filter((m) => !isBulkMemory(m))
    .sort((a, b) => usefulness(b) - usefulness(a) || b.updatedAt - a.updatedAt);

  const { created, updated, suppressed, toolCalls } = args.stats;
  const head = [
    `# Day ${args.dayKey} (UTC)`,
    `Created ${created}, updated ${updated}, suppressed ${suppressed}, tool calls ${toolCalls}.`,
  ];
  const other =
    bulk.length > 0 ? ["", "# Other items", ...bulkLines(bulk)] : [];
  const digest = traceDigest(args.activity.traces);
  const tools = digest.length > 0 ? ["", "# Tool calls", ...digest] : [];

  let budget =
    cap -
    estimateTokens([...head, ...other, ...tools, "", "# Memories"].join("\n"));
  const memoryLines: string[] = [];
  const memoryIds: string[] = [];
  for (const memory of notes) {
    const line = memoryLine(memory, args.startMs);
    const cost = estimateTokens(line) + 1;
    if (cost > budget) break;
    budget -= cost;
    memoryLines.push(line);
    memoryIds.push(memory.memoryId);
  }
  const memories =
    memoryLines.length > 0 ? ["", "# Memories", ...memoryLines] : [];

  return {
    body: [...head, ...memories, ...other, ...tools].join("\n"),
    memoryIds,
  };
}

const rollupReplySchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()).catch([]),
  memoryIds: z.array(z.string()).catch([]),
});

export interface ParsedRollup {
  summary: string;
  highlights: string[];
  memoryIds: string[];
}

/** Null when the reply is not JSON or has no summary. Unknown ids drop. */
export function parseRollupReply(
  raw: string,
  allowedMemoryIds: ReadonlySet<string>,
): ParsedRollup | null {
  const parsed = parseJsonString(raw, rollupReplySchema);
  if (!parsed) return null;
  const summary = parsed.summary.trim();
  if (summary.length === 0) return null;
  const highlights = parsed.highlights
    .map((h) => clip(h, HIGHLIGHT_MAX_CHARS))
    .filter((h) => h.length > 0)
    .slice(0, HIGHLIGHTS_MAX);
  const memoryIds = [...new Set(parsed.memoryIds)]
    .filter((id) => allowedMemoryIds.has(id))
    .slice(0, MEMORY_IDS_MAX);
  return {
    summary:
      summary.length > SUMMARY_MAX_CHARS
        ? truncateAtWord(summary, SUMMARY_MAX_CHARS)
        : summary,
    highlights,
    memoryIds,
  };
}
