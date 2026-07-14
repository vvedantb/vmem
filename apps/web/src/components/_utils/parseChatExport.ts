import { unzipSync } from "fflate";
import { z } from "zod";
import type { ExportImportRow } from "./importRows";

// shared parser for claude-style conversation+messages export json

export type ChatExportVendor = "claude";

export type ParseExportResult =
  | { ok: true; rows: ExportImportRow[] }
  | { ok: false; error: string };

// A single block inside an array-shaped message body
const blockSchema = z
  .union([
    z.string(),
    z.object({ text: z.string().optional().catch(undefined) }),
  ])
  .nullable()
  .catch(null);

const blocksSchema = z.array(blockSchema);

// message body: a plain string, or an object wrapping text/blocks
const contentSchema = z
  .union([
    z.string(),
    z.object({
      text: z.string().optional().catch(undefined),
      // Claude nests blocks under `content`; other vendors may use `parts`
      content: blocksSchema.optional().catch(undefined),
      parts: blocksSchema.optional().catch(undefined),
    }),
  ])
  .nullable()
  .catch(null);

// `sender` / `author` are sometimes a bare role string, sometimes an object
const roleHolderSchema = z
  .union([
    z.string(),
    z.object({ role: z.string().optional().catch(undefined) }),
  ])
  .nullable()
  .catch(null);

const messageSchema = z
  .object({
    role: z.string().optional().catch(undefined),
    sender: roleHolderSchema.optional(),
    author: roleHolderSchema.optional(),
    content: contentSchema.optional(),
    text: z.string().optional().catch(undefined),
    message: z.string().optional().catch(undefined),
    response: z.string().optional().catch(undefined),
  })
  .nullable()
  .catch(null);

const messagesSchema = z.array(messageSchema).optional().catch(undefined);

const timestampSchema = z
  .union([z.string(), z.number()])
  .optional()
  .catch(undefined);

const optionalString = z.string().optional().catch(undefined);

const conversationObjectSchema = z.object({
  uuid: optionalString,
  id: optionalString,
  conversation_id: optionalString,
  chat_id: optionalString,
  title: optionalString,
  name: optionalString,
  subject: optionalString,
  summary: optionalString,
  display_name: optionalString,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  chat_messages: messagesSchema,
  messages: messagesSchema,
  message_history: messagesSchema,
  history: messagesSchema,
  turns: messagesSchema,
});

const conversationSchema = conversationObjectSchema.nullable().catch(null);

// the file root is either an array of conversations, or an object that is itself a
const rootSchema = z.union([
  z.array(conversationSchema),
  conversationObjectSchema.extend({
    conversations: z.array(conversationSchema).optional().catch(undefined),
    chats: z.array(conversationSchema).optional().catch(undefined),
    data: z.array(conversationSchema).optional().catch(undefined),
    items: z.array(conversationSchema).optional().catch(undefined),
  }),
]);

type Conversation = z.infer<typeof conversationObjectSchema>;
type Message = z.infer<typeof messageSchema>;
type Block = z.infer<typeof blockSchema>;

function textFromUtf8(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}

// pull the first JSON-looking file out of a vendor export zip
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
      const text = textFromUtf8(file).trim();
      if (text.startsWith("[") || text.startsWith("{")) return text;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeRole(raw: string): string {
  const role = raw.toLowerCase();
  if (role === "human" || role === "user") return "User";
  if (
    role === "assistant" ||
    role === "claude" ||
    role === "ai" ||
    role === "bot"
  ) {
    return "Assistant";
  }
  if (role === "system") return "System";
  return "Other";
}

function textFromBlocks(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (typeof block === "string") parts.push(block);
    else if (block?.text) parts.push(block.text);
  }
  return parts.join("\n").trim();
}

function messageText(msg: Message): string {
  if (!msg) return "";
  const content = msg.content;
  if (typeof content === "string") return content.trim();
  if (content) {
    if (content.text) return content.text.trim();
    const blocks = content.content ?? content.parts;
    if (blocks) return textFromBlocks(blocks);
  }
  return (msg.text ?? msg.message ?? msg.response ?? "").trim();
}

function messageRole(msg: Message): string {
  if (!msg) return "Other";
  if (msg.role) return normalizeRole(msg.role);
  for (const holder of [msg.sender, msg.author]) {
    if (typeof holder === "string") return normalizeRole(holder);
    if (holder?.role) return normalizeRole(holder.role);
  }
  return "Other";
}

function formatLines(msgs: Message[]): string {
  const parts: string[] = [];
  for (const msg of msgs) {
    const text = messageText(msg);
    if (!text) continue;
    parts.push(`${messageRole(msg)}:\n${text}`);
  }
  return parts.join("\n\n");
}

// first non-empty messages array across the key names the vendors use
function pickMessages(conv: Conversation): Message[] | null {
  const candidates = [
    conv.chat_messages,
    conv.messages,
    conv.message_history,
    conv.history,
    conv.turns,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const msgs = candidate.filter((msg) => msg !== null);
    if (msgs.length > 0) return msgs;
  }
  return null;
}

function conversationTitle(conv: Conversation): string {
  const candidates = [
    conv.title,
    conv.name,
    conv.subject,
    conv.summary,
    conv.display_name,
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) return candidate.trim();
  }
  return "Untitled conversation";
}

function conversationStableId(
  conv: Conversation,
  index: number,
  vendor: ChatExportVendor,
): string {
  const candidates = [conv.uuid, conv.id, conv.conversation_id, conv.chat_id];
  for (const candidate of candidates) {
    if (candidate && candidate.length > 0) return candidate;
  }
  const stamp = conv.updated_at ?? conv.created_at;
  if (typeof stamp === "number" || (stamp && stamp.length > 0)) {
    return `${vendor}-${String(stamp)}-${String(index)}`;
  }
  return `${vendor}-row-${String(index)}`;
}

function collectConversations(
  root: z.infer<typeof rootSchema>,
): Conversation[] {
  if (Array.isArray(root)) {
    return root.filter((conv) => conv !== null);
  }
  // A single-conversation file: the root object holds the messages itself
  if (pickMessages(root)) return [root];
  for (const wrapper of [
    root.conversations,
    root.chats,
    root.data,
    root.items,
  ]) {
    if (!wrapper) continue;
    const convs = wrapper.filter((conv) => conv !== null);
    if (convs.length > 0) return convs;
  }
  return [];
}

export function parseChatExportJsonText(
  jsonText: string,
  vendor: ChatExportVendor,
  noMessagesError: string,
): ParseExportResult {
  const parsed = (() => {
    try {
      return rootSchema.safeParse(JSON.parse(jsonText));
    } catch {
      return null;
    }
  })();
  if (!parsed) return { ok: false, error: "Invalid JSON." };

  const convs = parsed.success ? collectConversations(parsed.data) : [];
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
    const msgs = pickMessages(conv);
    if (!msgs) continue;
    const content = formatLines(msgs);
    if (!content) continue;
    rows.push({
      stableId: conversationStableId(conv, i, vendor),
      title: conversationTitle(conv),
      content,
    });
  }
  if (rows.length === 0) {
    return { ok: false, error: noMessagesError };
  }
  return { ok: true, rows };
}

export function parseChatExportBuffer(
  buffer: ArrayBuffer,
  vendor: ChatExportVendor,
  noMessagesError: string,
): ParseExportResult {
  const bytes = new Uint8Array(buffer);
  const fromZip = extractJsonFromZip(bytes);
  const jsonText = fromZip ?? textFromUtf8(bytes);
  return parseChatExportJsonText(jsonText, vendor, noMessagesError);
}
