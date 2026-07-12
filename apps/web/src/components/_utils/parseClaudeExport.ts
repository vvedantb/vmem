import {
  parseChatExportBuffer,
  parseChatExportJsonText,
  type ParseExportResult,
} from "./parseChatExport";

const NO_MESSAGES_ERROR =
  "No readable messages found. Export chat_messages/messages if your file uses a different shape.";

export function parseClaudeExportJsonText(jsonText: string): ParseExportResult {
  return parseChatExportJsonText(jsonText, "claude", NO_MESSAGES_ERROR);
}

export function parseClaudeExportBuffer(
  buffer: ArrayBuffer,
): ParseExportResult {
  return parseChatExportBuffer(buffer, "claude", NO_MESSAGES_ERROR);
}
