import { z } from "zod";
import { approxTokens, head, shortHash, tail } from "./text.ts";
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

interface Turn {
  role: Role;
  text: string;
  timestamp: number | null;
}

interface NormalizeOptions {
  /** Hard cap on the kept text, in approx tokens (chars / 4). */
  maxTokens: number;
  /** Assistant text turns kept from the end of the run. */
  finalAssistantTurns: number;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  maxTokens: 6000,
  finalAssistantTurns: 4,
};

const VERIFIER_PATTERN = /#\s*Verifier result[\s\S]{0,200}?\b(PASS|FAIL)\b/g;
const VERIFIER_HEADER = /#\s*Verifier result/;

// Parts that are tool traffic or hidden reasoning, never user/assistant prose.
const NON_TEXT_PART_TYPES = new Set([
  "tool_use",
  "tool_result",
  "tool_call",
  "tool",
  "function_call",
  "function_call_output",
  "custom_tool_call",
  "custom_tool_call_output",
  "local_shell_call",
  "reasoning",
  "thinking",
  "redacted_thinking",
  "image",
  "input_image",
  "step-start",
  "step-finish",
]);

// Harness-injected "user" messages (Codex AGENTS.md / environment blocks,
// Claude Code command echoes). They are not the task and not feedback.
const BOILERPLATE_PATTERNS: readonly RegExp[] = [
  /^<(environment_context|user_instructions|system-reminder|command-name|command-message|local-command-stdout|local-command-stderr|user-prompt-submit-hook)\b/,
  /^# AGENTS\.md instructions/i,
  /^Caveat: The messages below were generated/,
  /^\[Request interrupted by user/,
];

const MIN_PROMPT_CHARS = 20;
const FEEDBACK_ITEM_CHARS = 1200;
const ASSISTANT_ITEM_CHARS = 2400;

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

/** Prose from a content value: string, part list, or `{text}` part. */
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
  const type = asString(object.type);
  if (type !== null && NON_TEXT_PART_TYPES.has(type)) return "";
  const text = asString(object.text);
  if (text !== null) return text;
  if (object.content !== undefined) return textOf(object.content);
  return "";
}

/** True when a content list holds only tool results (Claude Code user turns). */
function isToolOnly(content: JsonValue | undefined): boolean {
  const parts = asArray(content);
  return (
    parts.length > 0 &&
    parts.every((part) => {
      const type = asString(asObject(part)?.type);
      return type !== null && NON_TEXT_PART_TYPES.has(type);
    })
  );
}

// --- format sniffing --------------------------------------------------------

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
  if (objects.some((o) => isAcpRecord(o))) return "acp";
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
  return "generic";
}

function isAcpRecord(object: JsonObject): boolean {
  const method = asString(object.method);
  if (method?.startsWith("session/")) return true;
  return asObject(asObject(object.params)?.update)?.sessionUpdate !== undefined;
}

// --- per-format turn extraction ---------------------------------------------

function atifTurns(root: JsonObject): Turn[] {
  return asArray(root.steps).flatMap((step) => {
    const object = asObject(step);
    if (!object) return [];
    const role = mapRole(asString(object.source));
    if (!role) return [];
    return [
      { role, text: textOf(object.message), timestamp: timestampOf(object) },
    ];
  });
}

function claudeCodeTurns(records: JsonObject[]): Turn[] {
  return records.flatMap((record) => {
    const message = asObject(record.message);
    if (!message) return [];
    const role = mapRole(asString(message.role) ?? asString(record.type));
    if (!role) return [];
    const toolOnly = role === "user" && isToolOnly(message.content);
    return [
      {
        role: toolOnly ? "tool" : role,
        text: toolOnly ? "" : textOf(message.content),
        timestamp: timestampOf(record),
      },
    ];
  });
}

function codexTurns(records: JsonObject[]): Turn[] {
  const responseTurns: Turn[] = [];
  const eventTurns: Turn[] = [];
  for (const record of records) {
    // Older Codex rollouts put the item at the top level, newer ones in payload.
    const payload = asObject(record.payload) ?? record;
    const timestamp = timestampOf(record);
    const type = asString(payload.type);
    if (type === "message") {
      const role = mapRole(asString(payload.role));
      if (role) {
        responseTurns.push({ role, text: textOf(payload.content), timestamp });
      }
    } else if (type === "function_call_output") {
      responseTurns.push({ role: "tool", text: "", timestamp });
    } else if (type === "user_message" || type === "agent_message") {
      eventTurns.push({
        role: type === "user_message" ? "user" : "assistant",
        text: asString(payload.message) ?? "",
        timestamp,
      });
    }
  }
  // event_msg duplicates response items; use it only when items are missing.
  return responseTurns.some((turn) => turn.text.length > 0)
    ? responseTurns
    : eventTurns;
}

function openCodeTurns(root: JsonObject): Turn[] {
  return asArray(root.messages).flatMap((message) => {
    const object = asObject(message);
    const info = asObject(object?.info);
    if (!object || !info) return [];
    const role = mapRole(asString(info.role));
    if (!role) return [];
    return [{ role, text: textOf(object.parts), timestamp: timestampOf(info) }];
  });
}

const ACP_UPDATE_ROLES: Record<string, Role> = {
  user_message_chunk: "user",
  agent_message_chunk: "assistant",
  tool_call: "tool",
  tool_call_update: "tool",
};

function acpTurns(records: JsonObject[]): Turn[] {
  const turns: Turn[] = [];
  const push = (role: Role, text: string, timestamp: number | null) => {
    const last = turns.at(-1);
    // Message chunks stream in pieces; join consecutive chunks of one role.
    if (last && last.role === role && role !== "tool") {
      last.text += text;
      return;
    }
    turns.push({ role, text, timestamp });
  };
  for (const record of records) {
    const params = asObject(record.params);
    const timestamp = timestampOf(record);
    if (asString(record.method) === "session/prompt" && params) {
      // A new prompt always starts a new user turn.
      turns.push({ role: "user", text: textOf(params.prompt), timestamp });
      continue;
    }
    const update = asObject(params?.update);
    const kind = asString(update?.sessionUpdate);
    const role = kind === null ? undefined : ACP_UPDATE_ROLES[kind];
    if (!update || !role) continue;
    push(role, role === "tool" ? "" : textOf(update.content), timestamp);
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
    const toolOnly = role === "user" && isToolOnly(object.content);
    out.push({
      role: toolOnly ? "tool" : role,
      text: toolOnly ? "" : textOf(body),
      timestamp: timestampOf(object),
    });
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

// --- run assembly ------------------------------------------------------------

function isBoilerplate(text: string): boolean {
  const trimmed = text.trimStart();
  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function lastVerdict(text: string): Outcome | null {
  let verdict: Outcome | null = null;
  for (const match of text.matchAll(VERIFIER_PATTERN)) {
    verdict = match[1] === "PASS" ? "PASS" : "FAIL";
  }
  return verdict;
}

/**
 * Keeps the head of the prompt and the tail of the run inside the token cap:
 * prompt up to 40%, newest feedback up to 30%, then the newest assistant turns.
 */
function trimToBudget(
  taskPrompt: string,
  feedback: string[],
  assistant: string[],
  maxTokens: number,
): {
  taskPrompt: string;
  userFeedback: string[];
  finalAssistant: string[];
  chars: number;
} {
  const budget = maxTokens * 4;
  const prompt = head(taskPrompt, Math.floor(budget * 0.4));
  let left = budget - prompt.length;
  const takeNewest = (items: string[], cap: number, itemCap: number) => {
    const kept: string[] = [];
    let used = 0;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = tail(items[i] ?? "", itemCap);
      if (used + item.length > cap) break;
      kept.unshift(item);
      used += item.length;
    }
    return { kept, used };
  };
  const fb = takeNewest(
    feedback,
    Math.min(left, Math.floor(budget * 0.3)),
    FEEDBACK_ITEM_CHARS,
  );
  left -= fb.used;
  const asst = takeNewest(assistant, left, ASSISTANT_ITEM_CHARS);
  return {
    taskPrompt: prompt,
    userFeedback: fb.kept,
    finalAssistant: asst.kept,
    chars: prompt.length + fb.used + asst.used,
  };
}

/** Pure: raw trajectory text to a NormalizedRun. Never throws on bad input. */
export function normalizeTrajectory(
  file: string,
  raw: string,
  options: NormalizeOptions = DEFAULT_NORMALIZE_OPTIONS,
): NormalizedRun {
  const records = parseRecords(raw);
  const format = sniffFormat(records);
  const turns = extractTurns(records, format)
    .map((turn) => ({ ...turn, text: turn.text.trim() }))
    .filter((turn) => turn.role === "tool" || turn.text.length > 0);

  let outcome: Outcome | null = null;
  const verifierIndex = turns.findLastIndex(
    (turn) => turn.role === "user" && VERIFIER_HEADER.test(turn.text),
  );
  const verifier = turns[verifierIndex];
  if (verifier) outcome = lastVerdict(verifier.text);
  // Unknown shapes: the verdict text is still in the raw file (maybe escaped).
  outcome ??= lastVerdict(raw.replaceAll("\\n", "\n"));

  const userTexts = turns.flatMap((turn, index) =>
    turn.role === "user" &&
    index !== verifierIndex &&
    !VERIFIER_HEADER.test(turn.text) &&
    !isBoilerplate(turn.text)
      ? [turn.text]
      : [],
  );
  const promptIndex = userTexts.findIndex(
    (text) => text.length >= MIN_PROMPT_CHARS,
  );
  const taskPrompt = userTexts[promptIndex] ?? userTexts[0] ?? "";
  const feedback = promptIndex >= 0 ? userTexts.slice(promptIndex + 1) : [];
  const assistant = turns
    .filter((turn) => turn.role === "assistant" && turn.text.length > 0)
    .slice(-options.finalAssistantTurns)
    .map((turn) => turn.text);

  const rootObject = asObject(records[0]);
  const orderHint = turns.reduce<number | null>(
    (earliest, turn) =>
      turn.timestamp !== null &&
      (earliest === null || turn.timestamp < earliest)
        ? turn.timestamp
        : earliest,
    rootObject ? timestampOf(rootObject) : null,
  );

  const trimmed = trimToBudget(
    taskPrompt,
    feedback,
    assistant,
    options.maxTokens,
  );
  return {
    file,
    hash: shortHash(raw),
    format,
    taskPrompt: trimmed.taskPrompt,
    userFeedback: trimmed.userFeedback,
    finalAssistant: trimmed.finalAssistant,
    outcome: outcome ?? "UNKNOWN",
    orderHint,
    approxTokens: approxTokens(trimmed.chars),
  };
}
