import {
  parseChatExportBuffer,
  parseChatExportJsonText,
  type ParseExportResult,
} from "./parseChatExport";

const NO_MESSAGES_ERROR = "No readable messages found in the Grok export.";

export function parseGrokExportJsonText(jsonText: string): ParseExportResult {
  return parseChatExportJsonText(jsonText, "grok", NO_MESSAGES_ERROR);
}

export function parseGrokExportBuffer(buffer: ArrayBuffer): ParseExportResult {
  return parseChatExportBuffer(buffer, "grok", NO_MESSAGES_ERROR);
}
