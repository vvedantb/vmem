import {
  parseChatExportBuffer,
  parseChatExportJsonText,
  type ParseExportResult,
} from "./parseChatExport";

const NO_MESSAGES_ERROR = "No readable messages found in the DeepSeek export.";

export function parseDeepSeekExportJsonText(
  jsonText: string,
): ParseExportResult {
  return parseChatExportJsonText(jsonText, "deepseek", NO_MESSAGES_ERROR);
}

export function parseDeepSeekExportBuffer(
  buffer: ArrayBuffer,
): ParseExportResult {
  return parseChatExportBuffer(buffer, "deepseek", NO_MESSAGES_ERROR);
}
