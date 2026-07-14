import { describe, expect, it } from "vitest";
import { parseChatGptExportJsonText } from "./parseChatGptExport";
import { parseClaudeExportJsonText } from "./parseClaudeExport";

describe("parseChatGptExportJsonText", () => {
  it("walks the active branch from current_node and skips the empty root node", () => {
    const json = JSON.stringify([
      {
        title: "  Trip planning  ",
        conversation_id: "conv-1",
        current_node: "c",
        mapping: {
          root: { message: null, parent: null },
          a: {
            parent: "root",
            message: {
              author: { role: "user" },
              content: { parts: ["Where to?"] },
            },
          },
          b: {
            parent: "a",
            message: {
              author: { role: "tool" },
              content: { parts: ["searching..."] },
            },
          },
          c: {
            parent: "b",
            message: {
              author: { role: "assistant" },
              content: { parts: [{ text: "Lisbon" }, { content: " in May" }] },
            },
          },
        },
      },
    ]);

    const result = parseChatGptExportJsonText(json);
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          stableId: "conv-1",
          title: "Trip planning",
          content: "User:\nWhere to?\n\nAssistant:\nLisbon in May",
        },
      ],
    });
  });

  it("falls back to timestamp order when current_node is missing", () => {
    const json = JSON.stringify([
      {
        create_time: 1700,
        mapping: {
          second: {
            message: { role: "assistant", content: "Hi", create_time: 2 },
          },
          first: {
            message: { role: "user", content: "Hello", create_time: 1 },
          },
        },
      },
    ]);

    expect(parseChatGptExportJsonText(json)).toEqual({
      ok: true,
      rows: [
        {
          stableId: "chatgpt-1700-0",
          title: "Untitled conversation",
          content: "User:\nHello\n\nAssistant:\nHi",
        },
      ],
    });
  });

  it("rejects non-array roots and invalid JSON", () => {
    expect(parseChatGptExportJsonText("{}")).toEqual({
      ok: false,
      error: "Expected a JSON array of conversations.",
    });
    expect(parseChatGptExportJsonText("not json")).toEqual({
      ok: false,
      error: "Invalid JSON.",
    });
  });
});

describe("parseClaudeExportJsonText", () => {
  it("reads chat_messages with block content and sender roles", () => {
    const json = JSON.stringify([
      {
        uuid: "claude-uuid",
        name: "Refactor chat",
        chat_messages: [
          { sender: "human", text: "Rename this" },
          {
            sender: { role: "assistant" },
            content: { content: ["Done", { text: "— renamed" }] },
          },
          "malformed entry",
          { sender: "human", text: "   " },
        ],
      },
    ]);

    expect(parseClaudeExportJsonText(json)).toEqual({
      ok: true,
      rows: [
        {
          stableId: "claude-uuid",
          title: "Refactor chat",
          content: "User:\nRename this\n\nAssistant:\nDone\n— renamed",
        },
      ],
    });
  });

  it("accepts a single conversation object at the root", () => {
    const json = JSON.stringify({
      updated_at: "2026-01-01",
      messages: [{ role: "claude", content: "Only message" }],
    });

    expect(parseClaudeExportJsonText(json)).toEqual({
      ok: true,
      rows: [
        {
          stableId: "claude-2026-01-01-0",
          title: "Untitled conversation",
          content: "Assistant:\nOnly message",
        },
      ],
    });
  });
});
