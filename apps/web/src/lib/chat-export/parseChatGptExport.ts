import { unzipSync } from "fflate";
import { z } from "zod";
import type { ExportImportRow, ParseExportResult } from "./importRows";
import { textFromUtf8 } from "./textFromUtf8";

// chatGPT's `conversations.json` is a mapping graph

// A block inside `content.parts`: a bare string or an object holding text
const partSchema = z
  .union([
    z.string(),
    z.object({
      text: z.string().optional().catch(undefined),
      content: z.string().optional().catch(undefined),
    }),
  ])
  .nullable()
  .catch(null);

const contentSchema = z
  .union([
    z.string(),
    z.object({
      parts: z.array(partSchema).optional().catch(undefined),
      text: z.string().optional().catch(undefined),
    }),
  ])
  .nullable()
  .catch(null);

const messageSchema = z
  .object({
    author: z
      .object({ role: z.string().optional().catch(undefined) })
      .nullable()
      .catch(null)
      .optional(),
    role: z.string().optional().catch(undefined),
    content: contentSchema.optional(),
    create_time: z.number().optional().catch(undefined),
    update_time: z.number().optional().catch(undefined),
  })
  .nullable()
  .catch(null);

const nodeSchema = z
  .object({
    message: messageSchema.optional(),
    parent: z.string().nullable().optional().catch(null),
  })
  .nullable()
  .catch(null);

const conversationSchema = z
  .object({
    title: z.string().optional().catch(undefined),
    conversation_id: z.string().optional().catch(undefined),
    id: z.string().optional().catch(undefined),
    create_time: z.number().optional().catch(undefined),
    current_node: z.string().optional().catch(undefined),
    mapping: z.record(z.string(), nodeSchema).optional().catch(undefined),
  })
  .nullable()
  .catch(null);

const rootSchema = z.array(conversationSchema);

type Conversation = NonNullable<z.infer<typeof conversationSchema>>;
type Message = NonNullable<z.infer<typeof messageSchema>>;
type MappingNode = z.infer<typeof nodeSchema>;

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

function extractTextFromContent(content: Message["content"]): string {
  if (typeof content === "string") return content.trim();
  if (!content) return "";
  const parts = content.parts;
  if (!parts) return content.text ? content.text.trim() : "";
  const chunks: string[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      chunks.push(part);
      continue;
    }
    if (part?.text) chunks.push(part.text);
    else if (part?.content) chunks.push(part.content);
  }
  return chunks.join("").trim();
}

function roleLabel(role: string): "User" | "Assistant" | "System" | "Other" {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  return "Other";
}

function messageRole(message: Message): string {
  return message.author?.role ?? message.role ?? "";
}

function messageTime(message: Message): number {
  return message.create_time ?? message.update_time ?? 0;
}

// flatten a conversation into ordered role/text lines
function linearizeConversation(
  conv: Conversation,
): { role: string; text: string }[] {
  const mapping = conv.mapping;
  if (!mapping) return [];

  const ordered: Message[] = [];
  const currentNode = conv.current_node;

  if (currentNode) {
    let nodeId: string | undefined = currentNode;
    const seen = new Set<string>();
    while (nodeId && !seen.has(nodeId)) {
      seen.add(nodeId);
      const mappingNode: MappingNode | undefined = mapping[nodeId];
      if (!mappingNode) break;
      if (mappingNode.message) ordered.push(mappingNode.message);
      nodeId = mappingNode.parent ?? undefined;
    }
    ordered.reverse();
  }

  if (ordered.length === 0) {
    const collected: Message[] = [];
    for (const node of Object.values(mapping)) {
      if (node?.message) collected.push(node.message);
    }
    collected.sort((a, b) => messageTime(a) - messageTime(b));
    ordered.push(...collected);
  }

  const lines: { role: string; text: string }[] = [];
  for (const msg of ordered) {
    const role = messageRole(msg);
    const text = extractTextFromContent(msg.content);
    if (!text) continue;
    if (role === "tool") continue;
    lines.push({ role, text });
  }
  return lines;
}

function formatTranscript(lines: { role: string; text: string }[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    parts.push(`${roleLabel(line.role)}:\n${line.text}`);
  }
  return parts.join("\n\n");
}

function conversationTitle(conv: Conversation): string {
  const title = conv.title;
  if (title && title.trim().length > 0) return title.trim();
  return "Untitled conversation";
}

function conversationId(conv: Conversation, index: number): string {
  const id = conv.conversation_id ?? conv.id;
  if (id && id.length > 0) return id;
  const createTime = conv.create_time;
  if (createTime !== undefined) {
    return `chatgpt-${String(createTime)}-${String(index)}`;
  }
  return `chatgpt-row-${String(index)}`;
}

export function parseChatGptExportJsonText(
  jsonText: string,
): ParseExportResult {
  const parsed = (() => {
    try {
      return rootSchema.safeParse(JSON.parse(jsonText));
    } catch {
      return null;
    }
  })();
  if (!parsed) return { ok: false, error: "Invalid JSON." };
  if (!parsed.success) {
    return { ok: false, error: "Expected a JSON array of conversations." };
  }

  const rows: ExportImportRow[] = [];
  const convs = parsed.data;
  for (let i = 0; i < convs.length; i++) {
    const conv = convs[i];
    if (!conv) continue;
    const content = formatTranscript(linearizeConversation(conv));
    if (!content) continue;
    rows.push({
      stableId: conversationId(conv, i),
      title: conversationTitle(conv),
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
): ParseExportResult {
  const bytes = new Uint8Array(buffer);
  const jsonText = findConversationsJsonInZip(bytes);
  if (jsonText) {
    return parseChatGptExportJsonText(jsonText);
  }
  return parseChatGptExportJsonText(textFromUtf8(bytes));
}
