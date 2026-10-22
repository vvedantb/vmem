import { z } from "zod";
import type { ToolHandlerResult } from "./content";

// pure trace builders for mcp tool calls: deterministic summary line, sanitised
// args, result ids and preview. no llm, no db.

export const TRACE_SUMMARY_MAX_CHARS = 140;
const TRACE_STRING_MAX_CHARS = 200;
export const TRACE_ARGS_MAX_CHARS = 2048;
const TRACE_PREVIEW_MAX_CHARS = 500;
const TRACE_ERROR_MAX_CHARS = 500;
export const TRACE_RESULT_IDS_MAX = 20;
const TRACE_ARRAY_MAX_ITEMS = 20;
const LABEL_MAX_CHARS = 40;

// keys dropped from args and previews: secrets, inline file bodies and
// artifact bodies
const DROPPED_KEY =
  /token|secret|password|api[_-]?key|authorization|base64|^body$/i;
// string values that look like credentials or inline file bytes
const REDACTED_VALUE =
  /^(vmem_sk_|sk-[A-Za-z0-9_-]{20,}|Bearer\s|data:[\w/+.-]+;base64,)/;

export type McpTraceBody = {
  summary: string;
  resultCount?: number;
  // profile the call ran on, when the args or result name one
  profileIdHint?: string;
  args: string;
  resultIds: string[];
  resultPreview?: string;
  error?: string;
};

function clipText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function quote(text: string): string {
  return `"${clipText(text.replace(/\s+/g, " ").trim(), LABEL_MAX_CHARS)}"`;
}

// JSON text with secret keys dropped, strings and arrays cut, total capped.
// over the cap the text is cut too, so it is not always parseable JSON.
export function sanitizeTraceJson(value: object, max: number): string {
  const json: string | undefined = JSON.stringify(value, (key, field) => {
    if (key !== "" && DROPPED_KEY.test(key)) return undefined;
    if (typeof field === "string") {
      if (REDACTED_VALUE.test(field)) return "[redacted]";
      return clipText(field, TRACE_STRING_MAX_CHARS);
    }
    if (Array.isArray(field) && field.length > TRACE_ARRAY_MAX_ITEMS) {
      return field.slice(0, TRACE_ARRAY_MAX_ITEMS);
    }
    return field;
  });
  return clipText(json ?? "", max);
}

const optionalString = z.string().optional().catch(undefined);
const optionalNumber = z.number().optional().catch(undefined);

const labelArgsSchema = z
  .object({
    query: optionalString,
    task: optionalString,
    title: optionalString,
    name: optionalString,
    path: optionalString,
    id: optionalString,
    memoryId: optionalString,
    profileId: optionalString,
  })
  .catch({});

type LabelArgs = z.infer<typeof labelArgsSchema>;

function argLabel(args: LabelArgs): string | undefined {
  return (
    args.query ??
    args.task ??
    args.title ??
    args.name ??
    args.path ??
    args.id ??
    args.memoryId
  );
}

const resultRowSchema = z
  .object({
    id: optionalString,
    title: optionalString,
    name: optionalString,
    deduped: z.boolean().optional().catch(undefined),
  })
  .catch({});

type ResultRow = z.infer<typeof resultRowSchema>;

const optionalRows = z.array(resultRowSchema).optional().catch(undefined);
const optionalStrings = z.array(z.string()).optional().catch(undefined);

const resultShapeSchema = z
  .object({
    id: optionalString,
    title: optionalString,
    deduped: z.boolean().optional().catch(undefined),
    profileId: optionalString,
    version: optionalNumber,
    bodyChars: optionalNumber,
    memories: optionalRows,
    artifacts: optionalRows,
    created: optionalRows,
    applied: optionalRows,
    failed: optionalRows,
    skills: optionalRows,
    memoryIds: optionalStrings,
    skillNames: optionalStrings,
  })
  .catch({});

type ResultShape = z.infer<typeof resultShapeSchema>;

const resultListSchema = z.array(resultRowSchema);

// a bare array result (e.g. files_list) is kept as rows, objects as a shape
function parseResultShape(data: ToolHandlerResult): {
  shape: ResultShape;
  list?: ResultRow[];
} {
  if (!data.ok) return { shape: {} };
  const list = resultListSchema.safeParse(data.data);
  if (list.success) return { shape: {}, list: list.data };
  return { shape: resultShapeSchema.parse(data.data) };
}

function resultRows(shape: ResultShape, list?: ResultRow[]): ResultRow[] {
  return (
    list ??
    shape.memories ??
    shape.artifacts ??
    shape.created ??
    shape.applied ??
    []
  );
}

function extractResultIds(shape: ResultShape, list?: ResultRow[]): string[] {
  const ids = new Set<string>();
  const add = (id: string | undefined) => {
    if (id !== undefined && id.length > 0) ids.add(id);
  };
  add(shape.id);
  for (const row of resultRows(shape, list)) add(row.id ?? row.name);
  for (const id of shape.memoryIds ?? []) add(id);
  for (const skill of shape.skills ?? []) add(skill.name ?? skill.id);
  for (const name of shape.skillNames ?? []) add(name);
  return [...ids].slice(0, TRACE_RESULT_IDS_MAX);
}

function resultCount(
  shape: ResultShape,
  list?: ResultRow[],
): number | undefined {
  return (
    list?.length ??
    shape.memories?.length ??
    shape.artifacts?.length ??
    shape.created?.length ??
    shape.applied?.length ??
    shape.memoryIds?.length ??
    shape.skills?.length
  );
}

type SummaryFormatter = (input: {
  args: LabelArgs;
  shape: ResultShape;
  count: number | undefined;
}) => string;

function withLabel(label: string | undefined, outcome: string): string {
  return label === undefined ? `→ ${outcome}` : `${quote(label)} → ${outcome}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// artifact reads: version and full body length (bodies are never traced)
const artifactReadSummary: SummaryFormatter = ({ args, shape }) => {
  if (shape.version === undefined) return withLabel(args.id, "not found");
  const chars =
    shape.bodyChars === undefined ? "" : `, ${plural(shape.bodyChars, "char")}`;
  return withLabel(shape.title ?? args.id, `v${shape.version}${chars}`);
};

const artifactVersionSummary: SummaryFormatter = ({ args, shape }) =>
  withLabel(args.id, `v${shape.version ?? "?"}`);

// per-tool text after the tool name, on success. others use genericBody.
const SUMMARY_FORMATTERS = new Map<string, SummaryFormatter>([
  [
    "memory_retrieve",
    ({ args, shape }) => {
      const hits = shape.memories ?? [];
      const top = hits[0]?.title;
      return withLabel(
        args.query,
        `${plural(hits.length, "hit")}${top ? ` (top: ${quote(top)})` : ""}`,
      );
    },
  ],
  [
    "memory_search",
    ({ args, shape }) =>
      withLabel(args.query, plural(shape.memories?.length ?? 0, "result")),
  ],
  [
    "memory_add",
    ({ args, shape }) =>
      `→ ${shape.deduped === true ? "deduped" : "added"} ${quote(shape.title ?? args.title ?? "")}`,
  ],
  [
    "memory_add_batch",
    ({ shape }) => {
      const created = shape.created ?? [];
      const deduped = created.filter((row) => row.deduped === true).length;
      return `→ ${created.length - deduped} added, ${deduped} deduped, ${shape.failed?.length ?? 0} failed`;
    },
  ],
  [
    "context_pack",
    ({ args, shape }) => {
      const memories = shape.memoryIds?.length ?? 0;
      return withLabel(
        args.task,
        `${memories} ${memories === 1 ? "memory" : "memories"}, ${plural(shape.skillNames?.length ?? 0, "skill")}`,
      );
    },
  ],
  ["artifacts_list", ({ count }) => `→ ${plural(count ?? 0, "artifact")}`],
  [
    "artifacts_search",
    ({ args, count }) => withLabel(args.query, plural(count ?? 0, "result")),
  ],
  ["artifacts_get", artifactReadSummary],
  ["artifacts_version_get", artifactReadSummary],
  ["artifacts_save", ({ args }) => withLabel(args.title, "saved")],
  ["artifacts_update", artifactVersionSummary],
  ["artifacts_restore_version", artifactVersionSummary],
]);

function genericBody(args: LabelArgs, count: number | undefined): string {
  const label = argLabel(args);
  const outcome = count === undefined ? "" : ` → ${plural(count, "result")}`;
  return `${label === undefined ? "" : quote(label)}${outcome}`;
}

function summaryLine(tool: string, body: string): string {
  return clipText(`${tool} ${body}`.trim(), TRACE_SUMMARY_MAX_CHARS);
}

export function buildToolTrace(
  tool: string,
  params: object,
  result: ToolHandlerResult,
): McpTraceBody {
  const args = labelArgsSchema.parse(params);
  const sanitizedArgs = sanitizeTraceJson(params, TRACE_ARGS_MAX_CHARS);
  if (!result.ok) {
    const error = clipText(result.error, TRACE_ERROR_MAX_CHARS);
    const label = argLabel(args);
    return {
      summary: summaryLine(
        tool,
        `${label === undefined ? "" : `${quote(label)} `}→ error: ${error}`,
      ),
      profileIdHint: args.profileId,
      args: sanitizedArgs,
      resultIds: [],
      error,
    };
  }

  const { shape, list } = parseResultShape(result);
  const count = resultCount(shape, list);
  const formatter = SUMMARY_FORMATTERS.get(tool);
  const body = formatter
    ? formatter({ args, shape, count })
    : genericBody(args, count);
  const data = result.data;
  return {
    summary: summaryLine(tool, body),
    resultCount: count,
    profileIdHint: args.profileId ?? shape.profileId,
    args: sanitizedArgs,
    resultIds: extractResultIds(shape, list),
    resultPreview:
      data === undefined || data === null
        ? undefined
        : typeof data === "object"
          ? sanitizeTraceJson(data, TRACE_PREVIEW_MAX_CHARS)
          : clipText(JSON.stringify(data), TRACE_PREVIEW_MAX_CHARS),
  };
}

export function resourceTraceTool(uri: string): string {
  return `resource:${uri}`;
}

export function buildResourceTrace(
  uri: string,
  outcome: { ok: true; text: string } | { ok: false; error: string },
): McpTraceBody {
  const tool = resourceTraceTool(uri);
  const args = sanitizeTraceJson({ uri }, TRACE_ARGS_MAX_CHARS);
  if (!outcome.ok) {
    const error = clipText(outcome.error, TRACE_ERROR_MAX_CHARS);
    return {
      summary: summaryLine(tool, `→ error: ${error}`),
      args,
      resultIds: [],
      error,
    };
  }
  return {
    summary: summaryLine(tool, `→ ${plural(outcome.text.length, "char")}`),
    args,
    resultIds: [],
    resultPreview: clipText(outcome.text, TRACE_PREVIEW_MAX_CHARS),
  };
}
