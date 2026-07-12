import { unzipSync } from "fflate";
import { isNumber, isRecord, isString } from "./guards";
import type { ExportImportRow } from "./importRows";

function textFromUtf8(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}

function extractJsonFromClaudeZip(buffer: Uint8Array): string | null {
  try {
    const unzipped = unzipSync(buffer);
    const names = Object.keys(unzipped).filter(
      (k) => k.endsWith(".json") && !k.includes("__MACOSX"),
    );
    const preferred = names.find((k) =>
      k.toLowerCase().includes("conversation"),
    );
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
  if (r === "assistant" || r === "claude") return "Assistant";
  if (r === "system") return "System";
  return "Other";
}

function messageText(msg: Record<string, unknown>): string {
  const c = msg.content;
  if (isString(c)) return c.trim();
  if (isRecord(c)) {
    if (isString(c.text)) return c.text.trim();
    if (Array.isArray(c.content)) {
      const parts: string[] = [];
      for (const block of c.content) {
        if (isString(block)) parts.push(block);
        else if (isRecord(block) && isString(block.text))
          parts.push(block.text);
      }
      return parts.join("\n").trim();
    }
  }
  if (isString(msg.text)) return msg.text.trim();
  return "";
}

function messageRole(msg: Record<string, unknown>): string {
  if (isString(msg.role)) return normalizeRole(msg.role);
  const sender = msg.sender;
  if (isString(sender)) return normalizeRole(sender);
  if (isRecord(sender) && isString(sender.role))
    return normalizeRole(sender.role);
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
  const keys = ["chat_messages", "messages", "message_history"] as const;
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
  const candidates = ["name", "title", "summary", "display_name"] as const;
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
  const candidates = ["uuid", "id", "conversation_id", "chat_id"] as const;
  for (const k of candidates) {
    const v = conv[k];
    if (isString(v) && v.length > 0) return v;
  }
  const u = conv.updated_at ?? conv.created_at;
  if (isString(u) && u.length > 0) return `claude-${u}-${String(index)}`;
  if (isNumber(u)) return `claude-${String(u)}-${String(index)}`;
  return `claude-row-${String(index)}`;
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
    const nested = parsed.conversations;
    if (Array.isArray(nested)) {
      const out: Record<string, unknown>[] = [];
      for (const x of nested) {
        if (isRecord(x)) out.push(x);
      }
      return out;
    }
    const chats = parsed.chats;
    if (Array.isArray(chats)) {
      const out: Record<string, unknown>[] = [];
      for (const x of chats) {
        if (isRecord(x)) out.push(x);
      }
      return out;
    }
  }
  return [];
}

export function parseClaudeExportJsonText(
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
      error:
        "No readable messages found. Export chat_messages/messages if your file uses a different shape.",
    };
  }
  return { ok: true, rows };
}

export function parseClaudeExportBuffer(
  buffer: ArrayBuffer,
): { ok: true; rows: ExportImportRow[] } | { ok: false; error: string } {
  const bytes = new Uint8Array(buffer);
  const fromZip = extractJsonFromClaudeZip(bytes);
  if (fromZip) {
    return parseClaudeExportJsonText(fromZip);
  }
  return parseClaudeExportJsonText(textFromUtf8(bytes));
}
