import { unzipSync } from "fflate";
import { isNumber, isRecord, isString } from "./guards";
import type { ExportImportRow } from "./importRows";

function textFromUtf8(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}

function extractJsonFromZip(buffer: Uint8Array): string | null {
  try {
    const unzipped = unzipSync(buffer);
    const names = Object.keys(unzipped).filter(
      (k) => k.endsWith(".json") && !k.includes("__MACOSX"),
    );
    const preferred = names.find((k) => {
      const n = k.toLowerCase();
      return n.includes("conversation") || n.includes("chat");
    });
    const ordered = preferred
      ? [preferred, ...names.filter((k) => k !== preferred)]
      : names;
    for (const name of ordered) {
      const file = unzipped[name];
      if (!file) continue;
      const t = textFromUtf8(file).trim();
      if (t.startsWith("[") || t.startsWith("{")) return t;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeRole(raw: string): string {
  const r = raw.toLowerCase();
  if (r === "human" || r === "user") return "User";
  if (r === "assistant" || r === "grok" || r === "ai" || r === "bot")
    return "Assistant";
  if (r === "system") return "System";
  return "Other";
}

function messageText(msg: Record<string, unknown>): string {
  const c = msg.content;
  if (isString(c)) return c.trim();
  if (isRecord(c)) {
    if (isString(c.text)) return c.text.trim();
    if (Array.isArray(c.parts)) {
      const parts: string[] = [];
      for (const block of c.parts) {
        if (isString(block)) parts.push(block);
        else if (isRecord(block) && isString(block.text))
          parts.push(block.text);
      }
      return parts.join("\n").trim();
    }
  }
  if (isString(msg.text)) return msg.text.trim();
  if (isString(msg.message)) return msg.message.trim();
  if (isString(msg.response)) return msg.response.trim();
  return "";
}

function messageRole(msg: Record<string, unknown>): string {
  if (isString(msg.role)) return normalizeRole(msg.role);
  const sender = msg.sender;
  if (isString(sender)) return normalizeRole(sender);
  if (isRecord(sender) && isString(sender.role))
    return normalizeRole(sender.role);
  const author = msg.author;
  if (isString(author)) return normalizeRole(author);
  if (isRecord(author) && isString(author.role))
    return normalizeRole(author.role);
  return "Other";
}

function formatLines(msgs: Record<string, unknown>[]): string {
  const parts: string[] = [];
  for (const msg of msgs) {
    const text = messageText(msg);
    if (!text) continue;
    const label = messageRole(msg);
    parts.push(`${label}:\n${text}`);
  }
  return parts.join("\n\n");
}

function pickMessagesArray(
  conv: Record<string, unknown>,
): Record<string, unknown>[] | null {
  const keys = ["messages", "chat_messages", "history", "turns"] as const;
  for (const k of keys) {
    const v = conv[k];
    if (Array.isArray(v)) {
      const out: Record<string, unknown>[] = [];
      for (const x of v) {
        if (isRecord(x)) out.push(x);
      }
      if (out.length > 0) return out;
    }
  }
  return null;
}

function conversationTitle(conv: Record<string, unknown>): string {
  const candidates = ["title", "name", "subject", "display_name"] as const;
  for (const k of candidates) {
    const v = conv[k];
    if (isString(v) && v.trim().length > 0) return v.trim();
  }
  return "Untitled conversation";
}

function conversationStableId(
  conv: Record<string, unknown>,
  index: number,
): string {
  const candidates = ["id", "uuid", "conversation_id", "chat_id"] as const;
  for (const k of candidates) {
    const v = conv[k];
    if (isString(v) && v.length > 0) return v;
  }
  const u = conv.updated_at ?? conv.created_at;
  if (isString(u) && u.length > 0) return `grok-${u}-${String(index)}`;
  if (isNumber(u)) return `grok-${String(u)}-${String(index)}`;
  return `grok-row-${String(index)}`;
}

function collectConversations(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    const out: Record<string, unknown>[] = [];
    for (const x of parsed) {
      if (isRecord(x)) out.push(x);
    }
    return out;
  }
  if (isRecord(parsed)) {
    const wrappers = ["conversations", "chats", "data", "items"] as const;
    for (const key of wrappers) {
      const nested = parsed[key];
      if (Array.isArray(nested)) {
        const out: Record<string, unknown>[] = [];
        for (const x of nested) {
          if (isRecord(x)) out.push(x);
        }
        if (out.length > 0) return out;
      }
    }
  }
  return [];
}

export function parseGrokExportJsonText(
  jsonText: string,
): { ok: true; rows: ExportImportRow[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }
  let convs: Record<string, unknown>[];
  if (isRecord(parsed) && pickMessagesArray(parsed)) {
    convs = [parsed];
  } else {
    convs = collectConversations(parsed);
  }
  if (convs.length === 0) {
    return {
      ok: false,
      error:
        "No conversations found. Expected a JSON array or an object with a conversations array.",
    };
  }
  const rows: ExportImportRow[] = [];
  for (let i = 0; i < convs.length; i++) {
    const conv = convs[i];
    if (!conv) continue;
    const msgs = pickMessagesArray(conv);
    if (!msgs) continue;
    const content = formatLines(msgs);
    if (!content) continue;
    rows.push({
      stableId: conversationStableId(conv, i),
      title: conversationTitle(conv),
      content,
    });
  }
  if (rows.length === 0) {
    return {
      ok: false,
      error: "No readable messages found in the Grok export.",
    };
  }
  return { ok: true, rows };
}

export function parseGrokExportBuffer(
  buffer: ArrayBuffer,
): { ok: true; rows: ExportImportRow[] } | { ok: false; error: string } {
  const bytes = new Uint8Array(buffer);
  const fromZip = extractJsonFromZip(bytes);
  if (fromZip) {
    return parseGrokExportJsonText(fromZip);
  }
  return parseGrokExportJsonText(textFromUtf8(bytes));
}
