// Claude Code JSONL transcript -> compact text for vmem. Pure.
// Keeps user messages, assistant text, tool calls (name + short input) and
// short tool results. Drops thinking blocks, meta records and side chains.

import { objectSchema } from "./schemas.mjs";

/** Max characters kept from one tool input. */
export const MAX_TOOL_INPUT_CHARS = 300;
/** Max characters kept from one tool result. */
export const MAX_TOOL_RESULT_CHARS = 1000;

/**
 * @typedef {{ text: string; userTurns: number }} RenderedTranscript
 */

/**
 * One object per valid JSON line; other lines are skipped.
 * @param {string} jsonl
 * @returns {Record<string, unknown>[]}
 */
export function parseJsonl(jsonl) {
  const records = [];
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      records.push(objectSchema.parse(JSON.parse(trimmed)));
    } catch {}
  }
  return records;
}

/**
 * Compact text of a Claude Code session and its count of real user turns
 * (a user record with text, not only tool results).
 * @param {Record<string, unknown>[]} records
 * @returns {RenderedTranscript}
 */
export function renderTranscript(records) {
  const blocks = [];
  let userTurns = 0;
  for (const record of records) {
    if (record.isMeta === true || record.isSidechain === true) continue;
    if (record.type !== "user" && record.type !== "assistant") continue;
    const message = record.message;
    if (!objectSchema.is(message)) continue;
    const role = message.role === "assistant" ? "assistant" : "user";
    const lines = renderContent(message.content);
    if (lines.text.length > 0) {
      blocks.push(
        `## ${role === "user" ? "User" : "Assistant"}\n${lines.text.join("\n")}`,
      );
      if (role === "user") userTurns += 1;
    }
    if (lines.tools.length > 0) blocks.push(lines.tools.join("\n"));
  }
  return { text: blocks.join("\n\n"), userTurns };
}

/**
 * @param {unknown} content
 * @returns {{ text: string[]; tools: string[] }}
 */
function renderContent(content) {
  /** @type {string[]} */
  const text = [];
  /** @type {string[]} */
  const tools = [];
  if (typeof content === "string") {
    if (content.trim() !== "") text.push(content.trim());
    return { text, tools };
  }
  if (!Array.isArray(content)) return { text, tools };
  for (const part of content) {
    if (!objectSchema.is(part)) continue;
    switch (part.type) {
      case "text":
        if (typeof part.text === "string" && part.text.trim() !== "") {
          text.push(part.text.trim());
        }
        break;
      case "tool_use":
        tools.push(
          `→ tool ${typeof part.name === "string" ? part.name : "?"}: ${shorten(stringify(part.input), MAX_TOOL_INPUT_CHARS)}`,
        );
        break;
      case "tool_result":
        tools.push(
          `← ${part.is_error === true ? "error" : "result"}: ${shorten(resultText(part.content), MAX_TOOL_RESULT_CHARS)}`,
        );
        break;
      // thinking, redacted_thinking, image, ...: dropped
      default:
        break;
    }
  }
  return { text, tools };
}

/**
 * @param {unknown} content
 * @returns {string}
 */
function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return stringify(content);
  return content
    .map((part) =>
      objectSchema.is(part) && typeof part.text === "string" ? part.text : "",
    )
    .filter((part) => part !== "")
    .join("\n");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stringify(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Single-line `text`, cut to `max` characters with a count of what was dropped.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function shorten(text, max) {
  const flat = text.replace(/\s+/gu, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max)}… [+${flat.length - max} chars]`;
}
