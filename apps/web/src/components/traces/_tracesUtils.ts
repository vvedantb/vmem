import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import { TOOL_FILTER_ALL, type TraceStatus } from "@/lib/url-state/traces";

export type TraceRow = FunctionReturnType<
  typeof api.mcpTraces.listMine
>["page"][number];

// tool + ok filters for `listMine`; empty values mean "no filter"
export function traceListFilters(params: {
  tool: string;
  status: TraceStatus;
}): { tool?: string; ok?: boolean } {
  return {
    tool: params.tool === TOOL_FILTER_ALL ? undefined : params.tool,
    ok: params.status === "all" ? undefined : params.status === "ok",
  };
}

// there is no distinct-tools query, so the tool filter offers the tools on
// loaded rows, plus the selected tool so it stays visible while filtered
export function traceToolOptions(
  rows: readonly Pick<TraceRow, "tool">[],
  selected: string,
): string[] {
  const tools = new Set(rows.map((row) => row.tool));
  if (selected !== TOOL_FILTER_ALL) tools.add(selected);
  return [...tools].sort((a, b) => a.localeCompare(b));
}

export function formatTraceDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

// args are stored as capped JSON text; a cut string may not parse, so show it raw
export function prettyTraceArgs(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}
