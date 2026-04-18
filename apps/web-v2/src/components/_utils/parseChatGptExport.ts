import { unzipSync } from "fflate";
import { isNumber, isRecord, isString } from "./guards";
import type { ExportImportRow } from "./importRows";

function textFromUtf8(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}

function findConversationsJsonInZip(buffer: Uint8Array): string | null {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(buffer);
  } catch {
    return null;
  }
  const direct = unzipped["conversations.json"];
  if (direct) {
    return textFromUtf8(direct);
  }
  const keys = Object.keys(unzipped);
  const match = keys.find(
    (k) =>
      k.endsWith("conversations.json") || k.endsWith("/conversations.json"),
  );
  if (match) {
    const file = unzipped[match];
    if (file) return textFromUtf8(file);
  }
  return null;
}

function extractTextFromContent(content: unknown): string {
  if (isString(content)) return content.trim();
  if (!isRecord(content)) return "";
  const parts = content.parts;
  if (!Array.isArray(parts)) {
    const nested = content.text;
    return isString(nested) ? nested.trim() : "";
  }
  const chunks: string[] = [];
  for (const part of parts) {
    if (isString(part)) {
      chunks.push(part);
      continue;
    }
    if (isRecord(part)) {
      if (isString(part.text)) chunks.push(part.text);
      else if (isString(part.content)) chunks.push(part.content);
    }
  }
  return chunks.join("").trim();
}

function roleLabel(role: string): "User" | "Assistant" | "System" | "Other" {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  return "Other";
}

function messageRole(message: Record<string, unknown>): string {
  const author = message.author;
  if (isRecord(author) && isString(author.role)) return author.role;
  if (isString(message.role)) return message.role;
  return "";
}

function messageBody(message: Record<string, unknown>): string {
  const c = message.content;
  return extractTextFromContent(c);
}

function messageTime(message: Record<string, unknown>): number {
  const t = message.create_time;
  if (isNumber(t)) return t;
  const mt = message.update_time;
  if (isNumber(mt)) return mt;
  return 0;
}

function linearizeConversation(
  conv: Record<string, unknown>,
): { role: string; text: string }[] {
  const mappingRaw = conv.mapping;
  if (!isRecord(mappingRaw)) return [];

  const mapping = mappingRaw;
  const currentNode = conv.current_node;
  const ordered: Record<string, unknown>[] = [];

  if (isString(currentNode)) {
    let mid: string | undefined = currentNode;
    const seen = new Set<string>();
    while (mid && !seen.has(mid)) {
      seen.add(mid);
      const nodeId = mid;
      const rawNode: unknown = mapping[nodeId];
      if (!isRecord(rawNode)) break;
      const msg = rawNode.message;
      if (isRecord(msg)) ordered.push(msg);
      const parentRaw: unknown = rawNode.parent;
      mid = isString(parentRaw) ? parentRaw : undefined;
    }
    ordered.reverse();
  }

  if (ordered.length === 0) {
    const collected: Record<string, unknown>[] = [];
    for (const key of Object.keys(mapping)) {
      const entry = mapping[key];
      if (!isRecord(entry)) continue;
      const msg = entry.message;
      if (isRecord(msg)) collected.push(msg);
    }
    collected.sort((a, b) => messageTime(a) - messageTime(b));
    for (const msg of collected) {
      ordered.push(msg);
    }
  }

  const lines: { role: string; text: string }[] = [];
  for (const msg of ordered) {
    const role = messageRole(msg);
    const text = messageBody(msg);
    if (!text) continue;
    if (role === "tool") continue;
    lines.push({ role, text });
  }
  return lines;
}

function formatTranscript(lines: { role: string; text: string }[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    const label = roleLabel(line.role);
    parts.push(`${label}:\n${line.text}`);
  }
  return parts.join("\n\n");
}

function conversationTitle(conv: Record<string, unknown>): string {
  const t = conv.title;
  if (isString(t) && t.trim().length > 0) return t.trim();
  return "Untitled conversation";
}

function conversationId(conv: Record<string, unknown>, index: number): string {
  const id = conv.conversation_id ?? conv.id;
  if (isString(id) && id.length > 0) return id;
  const ct = conv.create_time;
  if (isNumber(ct)) return `chatgpt-${String(ct)}-${String(index)}`;
  return `chatgpt-row-${String(index)}`;
}

export function parseChatGptExportJsonText(
  jsonText: string,
): { ok: true; rows: ExportImportRow[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON array of conversations." };
  }
  const rows: ExportImportRow[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!isRecord(item)) continue;
    const lines = linearizeConversation(item);
    const content = formatTranscript(lines);
    if (!content) continue;
    rows.push({
      stableId: conversationId(item, i),
      title: conversationTitle(item),
      content,
    });
  }
  if (rows.length === 0) {
    return {
      ok: false,
      error: "No conversations with readable messages were found.",
    };
  }
  return { ok: true, rows };
}

export function parseChatGptExportBuffer(
  buffer: ArrayBuffer,
): { ok: true; rows: ExportImportRow[] } | { ok: false; error: string } {
  const bytes = new Uint8Array(buffer);
  const jsonText = findConversationsJsonInZip(bytes);
  if (jsonText) {
    return parseChatGptExportJsonText(jsonText);
  }
  return parseChatGptExportJsonText(textFromUtf8(bytes));
}
