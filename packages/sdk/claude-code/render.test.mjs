import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_TOOL_RESULT_CHARS,
  parseJsonl,
  renderTranscript,
} from "./render.mjs";

const jsonl = [
  { type: "user", message: { role: "user", content: "Fix the login bug" } },
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "SECRET PLAN the user cannot see" },
        { type: "text", text: "I will read the file." },
        {
          type: "tool_use",
          name: "Read",
          input: { file_path: "src/login.ts" },
        },
      ],
    },
  },
  {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          content: [{ type: "text", text: "x".repeat(5000) }],
        },
      ],
    },
  },
  { type: "user", isMeta: true, message: { role: "user", content: "meta" } },
  { type: "summary", summary: "ignored" },
]
  .map((record) => JSON.stringify(record))
  .concat(["not json", ""])
  .join("\n");

test("renders user, assistant text, tool calls and tool results", () => {
  const { text } = renderTranscript(parseJsonl(jsonl));
  assert.match(text, /## User\nFix the login bug/u);
  assert.match(text, /## Assistant\nI will read the file\./u);
  assert.match(text, /→ tool Read: \{"file_path":"src\/login\.ts"\}/u);
  assert.match(text, /← result: x+… \[\+4000 chars\]/u);
});

test("drops thinking, meta and non-message records", () => {
  const { text } = renderTranscript(parseJsonl(jsonl));
  assert.doesNotMatch(text, /SECRET PLAN/u);
  assert.doesNotMatch(text, /meta/u);
  assert.doesNotMatch(text, /ignored/u);
});

test("shortens a huge tool result", () => {
  const { text } = renderTranscript(parseJsonl(jsonl));
  const resultLine = text
    .split("\n")
    .find((line) => line.startsWith("← result"));
  assert.ok(resultLine);
  assert.ok(resultLine.length < MAX_TOOL_RESULT_CHARS + 50);
});

test("counts only user turns with text, not tool results", () => {
  assert.equal(renderTranscript(parseJsonl(jsonl)).userTurns, 1);
});
