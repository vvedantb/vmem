import { z } from "zod";
import { approxTokens, clip, shortHash, tail } from "./text.ts";
import type { NormalizedRun, Outcome, TrajectoryFormat } from "./types.ts";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

type Role = "user" | "assistant" | "system" | "tool";
type TurnKind = "text" | "reasoning" | "call" | "result";

interface Turn {
  role: Role;
  kind: TurnKind;
  text: string;
  /** Tool result flagged as failed, or with error-shaped text. */
  error: boolean;
  timestamp: number | null;
}

interface NormalizeOptions {
  /** Hard cap on the kept text, in approx tokens (chars / 4). */
  maxTokens: number;
  /** Task keywords to count in the raw run (see `NormalizedRun.mentions`). */
  keywords: readonly string[];
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  maxTokens: 6000,
  keywords: [],
};

const VERIFIER_PATTERN = /#\s*Verifier result[\s\S]{0,200}?\b(PASS|FAIL)\b/g;
const VERIFIER_HEADER = /#\s*Verifier result/;

// Harness blocks inside user messages (Codex, Claude Code, Codex-style ATIF).
const BOILERPLATE_BLOCK =
  /<(environment_context|user_instructions|system-reminder|skills_instructions|permissions instructions|collaboration_mode|multi_agent_mode|INSTRUCTIONS|command-name|command-message|command-args|local-command-stdout|local-command-stderr|user-prompt-submit-hook)\b[^>]*>[\s\S]*?<\/\1>/g;

// Whole user messages that the harness injects. Not the task, not feedback.
const BOILERPLATE_MESSAGES: readonly RegExp[] = [
  /^# AGENTS\.md instructions/i,
  /^Caveat: The messages below were generated/,
  /^\[Request interrupted by user/,
];

// A line that introduces the task: "Task Description:" (Terminus) or a
// heading such as "## Request" after a policy preamble.
const TASK_MARKER =
  /^[ \t]*(#{1,6}[ \t]*)?(?:\*\*)?(?:task description|task|your task|request|problem statement|issue description)(?:\*\*)?[ \t]*:?[ \t]*$/im;
// Terminus puts the terminal screen after the task.
const TASK_END = /^[ \t]*Current (?:terminal state|Terminal Screen)[ \t]*:/im;

// A paragraph is boilerplate when it is in the user messages of this many
// runs, next to this many different rarer texts (see findBoilerplate).
const BOILERPLATE_MIN_RUNS = 5;
const BOILERPLATE_MIN_CONTEXTS = 3;

// Codex in ATIF logs an empty "Executed <tool> <id>" text per tool call.
const NOISE_TEXT = /^Executed \S+ \S+$/;
const ERROR_TEXT =
  /Traceback \(most recent call last\)|\b[A-Z]\w*(?:Error|Exception)\b:|\berror:|\bcommand not found\b|\bNo such file or directory\b|\bexit (?:code|status) [1-9]/;

// Codex exec output: a header line, and in ATIF a Python repr of the parts.
const EXEC_HEADER = /^Script completed\nWall time [\d.]+ seconds\nOutput:\n/;
const PY_REPR_PARTS = /^\[\{'type': '\w+', 'text': /;
const PY_REPR_TEXT = /'text': (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;

const MIN_PROMPT_CHARS = 20;
/** Kept per non-user turn while parsing, so a corpus fits in memory. */
const PARSE_TURN_CHARS = 2000;
const PROMPT_SHARE = 0.3;
const FEEDBACK_SHARE = 0.25;
const FEEDBACK_ITEM_CHARS = 1500;
/** Share of the trajectory budget for the first steps when the middle is cut. */
const TRAJECTORY_HEAD_SHARE = 0.25;

interface StepCaps {
  text: number;
  reasoning: number;
  call: number;
  result: number;
  error: number;
}
// Tight caps apply when the full ones do not fit the budget.
const FULL_CAPS: StepCaps = {
  text: 1500,
  reasoning: 800,
  call: 600,
  result: 600,
  error: 1000,
};
const TIGHT_CAPS: StepCaps = {
  text: 800,
  reasoning: 300,
  call: 300,
  result: 200,
  error: 600,
};

// --- JSON helpers -----------------------------------------------------------

function asObject(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function asArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function parseJson(raw: string): JsonValue | null {
  try {
    const parsed = jsonValueSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Whole-file JSON first; JSONL (one record per line) as the fallback. */
function parseRecords(raw: string): JsonValue[] {
  const whole = parseJson(raw);
  if (whole !== null) return [whole];
  const records: JsonValue[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const record = parseJson(line);
    if (record !== null) records.push(record);
  }
  return records;
}

function parseTimestamp(value: JsonValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    // Seconds before ~2001-09 in ms are implausible for a trajectory.
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampOf(object: JsonObject): number | null {
  for (const key of [
    "timestamp",
    "created_at",
    "createdAt",
    "created",
    "time",
    "start_time",
    "started_at",
  ]) {
    const value = object[key];
    const direct = parseTimestamp(value);
    if (direct !== null) return direct;
    const nested = asObject(value);
    if (nested) {
      const inner = parseTimestamp(nested.created ?? nested.start);
      if (inner !== null) return inner;
    }
  }
  return null;
}

function mapRole(raw: string | null): Role | null {
  switch (raw?.toLowerCase()) {
    case "user":
    case "human":
      return "user";
    case "assistant":
    case "agent":
    case "model":
    case "ai":
      return "assistant";
    case "system":
    case "developer":
      return "system";
    case "tool":
    case "function":
    case "observation":
    case "ipython":
      return "tool";
    default:
      return null;
  }
}

/** Prose from a content value: string, `{text}` part, or a list of parts. */
function textOf(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => textOf(part))
      .filter((text) => text.trim().length > 0)
      .join("\n");
  }
  const object = asObject(value);
  if (!object) return "";
  const text = asString(object.text);
  if (text !== null) return text;
  if (object.content !== undefined) return textOf(object.content);
  return "";
}

// Argument keys that hold the command itself; shown raw, not as JSON.
const COMMAND_KEYS = [
  "command",
  "cmd",
  "keystrokes",
  "input",
  "code",
  "script",
  "query",
];

/** Tool arguments: the command string when there is one, else compact JSON. */
function argsText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    const parsed = value.trimStart().startsWith("{") ? parseJson(value) : null;
    return parsed === null ? value : argsText(parsed);
  }
  const object = asObject(value);
  if (object) {
    for (const key of COMMAND_KEYS) {
      const field = object[key];
      if (typeof field === "string") return field;
      if (Array.isArray(field) && field.every((x) => typeof x === "string")) {
        return field.join(" ");
      }
    }
  }
  return JSON.stringify(value);
}

const RESULT_KEYS = ["text", "output", "stdout", "content", "result", "error"];

/** Tool output: unwraps `{output}` / `{content}` envelopes and JSON strings. */
function resultText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    const parsed = value.trimStart().startsWith("{") ? parseJson(value) : null;
    return asObject(parsed ?? undefined)
      ? resultText(parsed ?? undefined)
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => resultText(item))
      .filter((text) => text.trim().length > 0)
      .join("\n");
  }
  for (const key of RESULT_KEYS) {
    const text = resultText(value[key]);
    if (text.trim().length > 0) return text;
  }
  return JSON.stringify(value);
}

/** Explicit failure flags in a tool result envelope. */
function flaggedError(value: JsonValue | undefined): boolean {
  const object =
    typeof value === "string" && value.trimStart().startsWith("{")
      ? asObject(parseJson(value) ?? undefined)
      : asObject(value);
  if (!object) return false;
  if (object.is_error === true || object.isError === true) return true;
  const status = asString(object.status)?.toLowerCase();
  if (status === "failed" || status === "error") return true;
  const metadata = asObject(object.metadata) ?? object;
  const exitCode = metadata.exit_code ?? metadata.exitCode;
  return typeof exitCode === "number" && exitCode !== 0;
}

// --- turn builders ------------------------------------------------------------

function say(role: Role, text: string, timestamp: number | null): Turn {
  return { role, kind: "text", text, error: false, timestamp };
}

function think(text: string, timestamp: number | null): Turn {
  return {
    role: "assistant",
    kind: "reasoning",
    text,
    error: false,
    timestamp,
  };
}

function call(
  name: string | null,
  args: JsonValue | undefined,
  timestamp: number | null,
): Turn {
  const text = [name, argsText(args)].filter(Boolean).join(" ");
  return { role: "assistant", kind: "call", text, error: false, timestamp };
}

/** Python repr of `[{'type': ..., 'text': ...}]` to its text parts. */
function unwrapPythonRepr(text: string): string {
  if (!PY_REPR_PARTS.test(text)) return text;
  return [...text.matchAll(PY_REPR_TEXT)]
    .map((match) =>
      (match[1] ?? match[2] ?? "").replace(/\\(.)/g, (_all, char: string) =>
        char === "n" ? "\n" : char === "t" ? "\t" : char,
      ),
    )
    .join("\n");
}

function result(
  value: JsonValue | undefined,
  failed: boolean,
  timestamp: number | null,
): Turn {
  const output = unwrapPythonRepr(resultText(value)).replace(EXEC_HEADER, "");
  const error = failed || flaggedError(value) || ERROR_TEXT.test(output);
  // A failed call with no output still tells the reader it failed.
  const text = output.trim() || (error ? "(failed, no output)" : "");
  return { role: "tool", kind: "result", text, error, timestamp };
}

/**
 * A content part list (Claude Code, Codex, OpenCode, generic). Text parts of
 * one message join into one turn; tool and reasoning parts become their own.
 */
function partsTurns(
  role: Role,
  content: JsonValue | undefined,
  timestamp: number | null,
): Turn[] {
  if (!Array.isArray(content)) {
    const text = textOf(content);
    return text ? [say(role, text, timestamp)] : [];
  }
  const out: Turn[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length > 0) out.push(say(role, buffer.join("\n"), timestamp));
    buffer = [];
  };
  for (const part of content) {
    const object = asObject(part);
    if (!object) {
      const text = textOf(part);
      if (text) buffer.push(text);
      continue;
    }
    const type = asString(object.type);
    switch (type) {
      case "thinking":
      case "reasoning":
        flush();
        out.push(
          think(
            asString(object.thinking) ?? textOf(object.text ?? object.summary),
            timestamp,
          ),
        );
        break;
      case "tool_use":
        flush();
        out.push(call(asString(object.name), object.input, timestamp));
        break;
      case "tool_result":
        flush();
        out.push(result(object.content, object.is_error === true, timestamp));
        break;
      case "tool": {
        // OpenCode: one part holds the call and its state.
        flush();
        const state = asObject(object.state);
        out.push(call(asString(object.tool), state?.input, timestamp));
        out.push(
          result(
            state?.output ?? state?.error,
            asString(state?.status) === "error",
            timestamp,
          ),
        );
        break;
      }
      case "redacted_thinking":
      case "image":
      case "input_image":
      case "step-start":
      case "step-finish":
        break;
      default: {
        const text = textOf(object);
        if (text) buffer.push(text);
      }
    }
  }
  flush();
  return out;
}

// --- format sniffing --------------------------------------------------------

// ACP session updates as flat records (`{type: "agent_message", text}`),
// mapped to the JSON-RPC `sessionUpdate` kinds.
const FLAT_ACP_KINDS: Record<string, string> = {
  user_message: "user_message_chunk",
  agent_message: "agent_message_chunk",
  agent_thought: "agent_thought_chunk",
  tool_call: "tool_call",
  tool_call_update: "tool_call_update",
};

function isAcpRpcRecord(object: JsonObject): boolean {
  const method = asString(object.method);
  if (method?.startsWith("session/")) return true;
  return asObject(asObject(object.params)?.update)?.sessionUpdate !== undefined;
}

function isFlatAcpRecord(object: JsonObject): boolean {
  const type = asString(object.type);
  return (
    type !== null &&
    FLAT_ACP_KINDS[type] !== undefined &&
    object.message === undefined &&
    object.payload === undefined
  );
}

function sniffFormat(records: JsonValue[]): TrajectoryFormat {
  const first = asObject(records[0]);
  if (records.length === 1 && first) {
    const version = asString(first.schema_version);
    if (version?.toUpperCase().startsWith("ATIF")) return "atif";
    const steps = asArray(first.steps);
    if (steps.some((step) => asObject(step)?.source !== undefined)) {
      return "atif";
    }
    const messages = asArray(first.messages);
    if (
      messages.some((m) => {
        const object = asObject(m);
        return object?.info !== undefined && object.parts !== undefined;
      })
    ) {
      return "opencode";
    }
  }
  const objects = records.flatMap((record) => {
    const object = asObject(record);
    return object ? [object] : [];
  });
  if (objects.some((o) => isAcpRpcRecord(o))) return "acp";
  if (
    objects.some(
      (o) =>
        asObject(o.payload) !== null &&
        ["response_item", "event_msg", "session_meta", "turn_context"].includes(
          asString(o.type) ?? "",
        ),
    )
  ) {
    return "codex";
  }
  if (
    objects.some(
      (o) =>
        (o.type === "user" || o.type === "assistant") &&
        asObject(o.message) !== null,
    )
  ) {
    return "claude-code";
  }
  // Checked after Claude Code: its logs also hold flat `user_message` records.
  if (objects.length > 1 && objects.every((o) => isFlatAcpRecord(o))) {
    return "acp";
  }
  return "generic";
}

// --- per-format turn extraction ---------------------------------------------

function atifTurns(root: JsonObject): Turn[] {
  return asArray(root.steps).flatMap((step) => {
    const object = asObject(step);
    if (!object) return [];
    const role = mapRole(asString(object.source));
    if (!role) return [];
    const timestamp = timestampOf(object);
    if (role !== "assistant") {
      return [say(role, textOf(object.message), timestamp)];
    }
    const reasoning = asString(object.reasoning_content);
    return [
      ...(reasoning ? [think(reasoning, timestamp)] : []),
      say(role, textOf(object.message), timestamp),
      ...asArray(object.tool_calls).flatMap((item) => {
        const toolCall = asObject(item);
        return toolCall
          ? [
              call(
                asString(toolCall.function_name),
                toolCall.arguments,
                timestamp,
              ),
            ]
          : [];
      }),
      ...asArray(asObject(object.observation)?.results).map((item) =>
        result(asObject(item)?.content, false, timestamp),
      ),
    ];
  });
}

function claudeCodeTurns(records: JsonObject[]): Turn[] {
  return records.flatMap((record) => {
    const timestamp = timestampOf(record);
    // Curated feedback and the verifier come as flat user_message records.
    if (record.type === "user_message") {
      return [
        say(
          mapRole(asString(record.role)) ?? "user",
          asString(record.text) ?? "",
          timestamp,
        ),
      ];
    }
    const message = asObject(record.message);
    if (!message) return [];
    const role = mapRole(asString(message.role) ?? asString(record.type));
    return role ? partsTurns(role, message.content, timestamp) : [];
  });
}

function codexTurns(records: JsonObject[]): Turn[] {
  const responseTurns: Turn[] = [];
  const eventTurns: Turn[] = [];
  for (const record of records) {
    // Older Codex rollouts put the item at the top level, newer ones in payload.
    const payload = asObject(record.payload) ?? record;
    const timestamp = timestampOf(record);
    switch (asString(payload.type)) {
      case "message": {
        const role = mapRole(asString(payload.role));
        if (role) {
          responseTurns.push(...partsTurns(role, payload.content, timestamp));
        }
        break;
      }
      case "reasoning":
        responseTurns.push(
          think(textOf(payload.summary) || textOf(payload.content), timestamp),
        );
        break;
      case "function_call":
        responseTurns.push(
          call(asString(payload.name), payload.arguments, timestamp),
        );
        break;
      case "custom_tool_call":
        responseTurns.push(
          call(asString(payload.name), payload.input, timestamp),
        );
        break;
      case "local_shell_call":
        responseTurns.push(
          call("shell", asObject(payload.action)?.command, timestamp),
        );
        break;
      case "function_call_output":
      case "custom_tool_call_output":
      case "local_shell_call_output":
        responseTurns.push(result(payload.output, false, timestamp));
        break;
      case "user_message":
      case "agent_message":
        eventTurns.push(
          say(
            payload.type === "user_message" ? "user" : "assistant",
            asString(payload.message) ?? "",
            timestamp,
          ),
        );
        break;
    }
    // event_msg item_completed repeats response items; it is skipped.
  }
  // event_msg duplicates response items; use it only when items are missing.
  return responseTurns.some((turn) => turn.kind === "text" && turn.text)
    ? responseTurns
    : eventTurns;
}

function openCodeTurns(root: JsonObject): Turn[] {
  return asArray(root.messages).flatMap((message) => {
    const object = asObject(message);
    const info = asObject(object?.info);
    if (!object || !info) return [];
    const role = mapRole(asString(info.role));
    return role ? partsTurns(role, object.parts, timestampOf(info)) : [];
  });
}

/** ACP: JSON-RPC `session/update` streams, or the same updates as flat records. */
function acpTurns(records: JsonObject[]): Turn[] {
  const turns: Turn[] = [];
  const append = (turn: Turn, chunked: boolean) => {
    const last = turns.at(-1);
    // RPC message chunks stream in pieces; join consecutive chunks of one
    // kind. Flat records are whole messages.
    if (chunked && last && last.role === turn.role && last.kind === turn.kind) {
      last.text += turn.text;
      return;
    }
    turns.push(turn);
  };
  for (const record of records) {
    const params = asObject(record.params);
    const timestamp = timestampOf(record);
    if (asString(record.method) === "session/prompt" && params) {
      // A new prompt always starts a new user turn.
      turns.push(say("user", textOf(params.prompt), timestamp));
      continue;
    }
    const rpcUpdate = asObject(params?.update);
    const update = rpcUpdate ?? (isFlatAcpRecord(record) ? record : null);
    if (!update) continue;
    const kind =
      asString(update.sessionUpdate) ??
      FLAT_ACP_KINDS[asString(update.type) ?? ""];
    const chunked = rpcUpdate !== null;
    const text = textOf(update.content) || (asString(update.text) ?? "");
    switch (kind) {
      case "user_message_chunk":
        append(say("user", text, timestamp), chunked);
        break;
      case "agent_message_chunk":
        append(say("assistant", text, timestamp), chunked);
        break;
      case "agent_thought_chunk":
        append(think(text, timestamp), chunked);
        break;
      case "tool_call":
      case "tool_call_update": {
        const failed = asString(update.status) === "failed";
        if (kind === "tool_call") {
          turns.push(
            call(
              asString(update.title) ?? asString(update.kind),
              update.rawInput,
              timestamp,
            ),
          );
        }
        const output = asArray(update.content).length
          ? update.content
          : update.rawOutput;
        if (output !== undefined || failed) {
          turns.push(result(output, failed, timestamp));
        }
        break;
      }
    }
  }
  return turns;
}

/** Unknown shapes: walk the tree and take any `{role, content|text}` node. */
function genericTurns(value: JsonValue, out: Turn[] = []): Turn[] {
  if (Array.isArray(value)) {
    for (const item of value) genericTurns(item, out);
    return out;
  }
  const object = asObject(value);
  if (!object) return out;
  const role = mapRole(
    asString(object.role) ?? asString(object.source) ?? asString(object.type),
  );
  const body = object.content ?? object.text ?? object.message;
  if (role && body !== undefined && asObject(body)?.role === undefined) {
    const timestamp = timestampOf(object);
    if (role === "tool") out.push(result(body, false, timestamp));
    else out.push(...partsTurns(role, body, timestamp));
    return out;
  }
  for (const child of Object.values(object)) genericTurns(child, out);
  return out;
}

function extractTurns(records: JsonValue[], format: TrajectoryFormat): Turn[] {
  const objects = records.flatMap((record) => {
    const object = asObject(record);
    return object ? [object] : [];
  });
  const root = objects[0];
  switch (format) {
    case "atif":
      return root ? atifTurns(root) : [];
    case "opencode":
      return root ? openCodeTurns(root) : [];
    case "claude-code":
      return claudeCodeTurns(objects);
    case "codex":
      return codexTurns(objects);
    case "acp":
      return acpTurns(objects);
    case "generic":
      return genericTurns(records);
  }
}

// --- boilerplate ------------------------------------------------------------

/**
 * The task text of one user message: harness blocks removed, and only the
 * part after a task marker ("Task Description:", "## Request") when present.
 */
export function extractTaskText(text: string): string {
  // Some harnesses wrap the whole prompt in quotes.
  const cleaned = text
    .replace(BOILERPLATE_BLOCK, "")
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .trim();
  if (BOILERPLATE_MESSAGES.some((pattern) => pattern.test(cleaned))) return "";
  const marker = TASK_MARKER.exec(cleaned);
  if (!marker) return cleaned;
  let body = cleaned.slice(marker.index + marker[0].length);
  const level = marker[1]?.trim().length ?? 0;
  const end =
    level > 0
      ? new RegExp(`^[ \\t]*#{1,${level}}[ \\t]+\\S`, "m").exec(body)
      : TASK_END.exec(body);
  if (end) body = body.slice(0, end.index);
  body = body.trim();
  return body.length >= MIN_PROMPT_CHARS ? body : cleaned;
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function paragraphKey(paragraph: string): string {
  return paragraph.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ");
}

/** A user message, and whether any assistant turn comes after it. */
export interface UserText {
  text: string;
  /** After the last assistant turn: post-run feedback, not part of the task. */
  trailing: boolean;
}

/**
 * Paragraph keys that are boilerplate across a corpus. A paragraph is
 * boilerplate when the runs that contain it hold different rarer text next
 * to it: a preamble in front of many tasks, or a first message whose real
 * task comes in a later user message. A real task repeated in many runs has
 * the same text around it each time, so it stays. Trailing messages do not
 * count as context: post-run feedback differs per run even for one task.
 */
export function findBoilerplate(
  runs: readonly (readonly UserText[])[],
): Set<string> {
  const keyed = runs.map((messages) =>
    messages.map((message) => ({
      trailing: message.trailing,
      keys: paragraphs(message.text).map(paragraphKey),
    })),
  );
  const runsOf = new Map<string, number[]>();
  keyed.forEach((messages, run) => {
    for (const key of new Set(messages.flatMap((message) => message.keys))) {
      runsOf.set(key, [...(runsOf.get(key) ?? []), run]);
    }
  });
  const count = (key: string) => runsOf.get(key)?.length ?? 0;
  const out = new Set<string>();
  for (const [key, members] of runsOf) {
    if (members.length < BOILERPLATE_MIN_RUNS) continue;
    const contexts = new Set<string>();
    for (const run of members) {
      const context = (keyed[run] ?? [])
        .filter((message) => !message.trailing)
        .flatMap((message) => message.keys)
        .filter((other) => count(other) < members.length)
        .join("\n");
      if (context) contexts.add(context);
    }
    if (contexts.size >= BOILERPLATE_MIN_CONTEXTS) out.add(key);
  }
  return out;
}

function stripBoilerplate(text: string, boilerplate: ReadonlySet<string>) {
  return paragraphs(text)
    .filter((paragraph) => !boilerplate.has(paragraphKey(paragraph)))
    .join("\n\n");
}

// --- run assembly ------------------------------------------------------------

/** A run before corpus-level boilerplate removal and trimming. */
export interface ParsedRun {
  file: string;
  hash: string;
  format: TrajectoryFormat;
  /** User messages after the task-text extraction, verifier excluded. */
  userTexts: UserText[];
  turns: Turn[];
  outcome: Outcome;
  orderHint: number | null;
  mentions: Record<string, number>;
}

function lastVerdict(text: string): Outcome | null {
  let verdict: Outcome | null = null;
  for (const match of text.matchAll(VERIFIER_PATTERN)) {
    verdict = match[1] === "PASS" ? "PASS" : "FAIL";
  }
  return verdict;
}

function countMentions(
  raw: string,
  keywords: readonly string[],
): Record<string, number> {
  const lower = raw.toLowerCase();
  const out: Record<string, number> = {};
  for (const keyword of keywords) {
    let count = 0;
    for (
      let at = lower.indexOf(keyword);
      at >= 0;
      at = lower.indexOf(keyword, at + keyword.length)
    ) {
      count += 1;
    }
    out[keyword] = count;
  }
  return out;
}

/** Pure: raw trajectory text to turns, outcome and user messages. */
export function parseTrajectory(
  file: string,
  raw: string,
  keywords: readonly string[] = [],
): ParsedRun {
  const records = parseRecords(raw);
  const format = sniffFormat(records);
  const turns = extractTurns(records, format)
    .map((turn) => {
      const text = turn.text.trim();
      return {
        ...turn,
        text: turn.role === "user" ? text : clip(text, PARSE_TURN_CHARS),
      };
    })
    .filter((turn) => turn.text.length > 0);

  let outcome: Outcome | null = null;
  const verifier = turns.findLast(
    (turn) => turn.role === "user" && VERIFIER_HEADER.test(turn.text),
  );
  if (verifier) outcome = lastVerdict(verifier.text);
  // Unknown shapes: the verdict text is still in the raw file (maybe escaped).
  outcome ??= lastVerdict(raw.replaceAll("\\n", "\n"));

  const lastAssistant = turns.findLastIndex(
    (turn) => turn.role === "assistant",
  );
  const userTexts: UserText[] = [];
  turns.forEach((turn, index) => {
    if (turn.role !== "user" || VERIFIER_HEADER.test(turn.text)) return;
    const text = extractTaskText(turn.text);
    if (text.length > 0)
      userTexts.push({ text, trailing: index > lastAssistant });
  });

  const rootObject = asObject(records[0]);
  const orderHint = turns.reduce<number | null>(
    (earliest, turn) =>
      turn.timestamp !== null &&
      (earliest === null || turn.timestamp < earliest)
        ? turn.timestamp
        : earliest,
    rootObject ? timestampOf(rootObject) : null,
  );
  return {
    file,
    hash: shortHash(raw),
    format,
    userTexts,
    turns,
    outcome: outcome ?? "UNKNOWN",
    orderHint,
    mentions: countMentions(raw, keywords),
  };
}

function renderStep(turn: Turn, caps: StepCaps): string {
  if (turn.role === "assistant") {
    if (turn.kind === "reasoning") {
      return `thinking: ${clip(turn.text, caps.reasoning)}`;
    }
    if (turn.kind === "call") return `call: ${clip(turn.text, caps.call)}`;
    if (NOISE_TEXT.test(turn.text)) return "";
    return `assistant: ${clip(turn.text, caps.text)}`;
  }
  if (turn.kind !== "result" || turn.text.length === 0) return "";
  // Errors keep their tail, where the message usually is.
  return turn.error
    ? `error: ${tail(turn.text, caps.error)}`
    : `result: ${clip(turn.text, caps.result)}`;
}

const length = (items: readonly string[]) =>
  items.reduce((sum, item) => sum + item.length, 0);

/**
 * Trajectory steps inside `budget` chars. All steps when they fit (full caps,
 * then tight caps); else the first steps and the newest ones, middle omitted.
 */
function fitTrajectory(turns: readonly Turn[], budget: number): string[] {
  let steps: string[] = [];
  for (const caps of [FULL_CAPS, TIGHT_CAPS]) {
    steps = turns.map((turn) => renderStep(turn, caps)).filter(Boolean);
    if (length(steps) <= budget) return steps;
  }
  const marker = (omitted: number) => `… ${omitted} steps omitted …`;
  const room = budget - marker(steps.length).length;
  const headSteps: string[] = [];
  let used = 0;
  for (const step of steps) {
    // The first step (usually the plan) is kept even past the head share.
    const cap = headSteps.length === 0 ? room : room * TRAJECTORY_HEAD_SHARE;
    if (used + step.length > cap) break;
    headSteps.push(step);
    used += step.length;
  }
  const tailSteps: string[] = [];
  for (let i = steps.length - 1; i >= headSteps.length; i -= 1) {
    const step = steps[i] ?? "";
    if (used + step.length > room) break;
    tailSteps.unshift(step);
    used += step.length;
  }
  const omitted = steps.length - headSteps.length - tailSteps.length;
  return omitted > 0
    ? [...headSteps, marker(omitted), ...tailSteps]
    : [...headSteps, ...tailSteps];
}

/**
 * Removes corpus boilerplate, picks the task prompt (first user message with
 * real text left), and fits prompt, feedback and trajectory into the cap:
 * prompt up to 30%, newest feedback up to 25%, the trajectory gets the rest.
 */
export function finishRun(
  parsed: ParsedRun,
  maxTokens: number,
  boilerplate: ReadonlySet<string> = new Set(),
): NormalizedRun {
  const stripped = parsed.userTexts.map(({ text }) =>
    stripBoilerplate(text, boilerplate),
  );
  let promptIndex = stripped.findIndex(
    (text) => text.length >= MIN_PROMPT_CHARS,
  );
  // Everything was boilerplate: fall back to the first user message.
  const taskText =
    promptIndex >= 0
      ? (stripped[promptIndex] ?? "")
      : (parsed.userTexts[0]?.text ?? "");
  if (promptIndex < 0) promptIndex = 0;
  const feedback = stripped
    .slice(promptIndex + 1)
    .filter((text) => text.length > 0);

  const budget = maxTokens * 4;
  const taskPrompt = clip(taskText, Math.floor(budget * PROMPT_SHARE));
  const feedbackCap = Math.min(
    budget - taskPrompt.length,
    Math.floor(budget * FEEDBACK_SHARE),
  );
  const userFeedback: string[] = [];
  let feedbackUsed = 0;
  for (let i = feedback.length - 1; i >= 0; i -= 1) {
    const item = clip(feedback[i] ?? "", FEEDBACK_ITEM_CHARS);
    if (feedbackUsed + item.length > feedbackCap) break;
    userFeedback.unshift(item);
    feedbackUsed += item.length;
  }
  const trajectory = fitTrajectory(
    parsed.turns.filter(
      (turn) => turn.role !== "user" && turn.role !== "system",
    ),
    budget - taskPrompt.length - feedbackUsed,
  );
  return {
    file: parsed.file,
    hash: parsed.hash,
    format: parsed.format,
    taskPrompt,
    userFeedback,
    trajectory,
    outcome: parsed.outcome,
    orderHint: parsed.orderHint,
    approxTokens: approxTokens(
      taskPrompt.length + feedbackUsed + length(trajectory),
    ),
    mentions: parsed.mentions,
  };
}

/** Normalises a corpus: boilerplate is learnt across all runs. */
export function normalizeRuns(
  parsed: readonly ParsedRun[],
  maxTokens: number,
): NormalizedRun[] {
  const boilerplate = findBoilerplate(parsed.map((run) => run.userTexts));
  return parsed.map((run) => finishRun(run, maxTokens, boilerplate));
}

/** Pure: one raw trajectory to a NormalizedRun. Never throws on bad input. */
export function normalizeTrajectory(
  file: string,
  raw: string,
  options: NormalizeOptions = DEFAULT_NORMALIZE_OPTIONS,
): NormalizedRun {
  return finishRun(
    parseTrajectory(file, raw, options.keywords),
    options.maxTokens,
  );
}
