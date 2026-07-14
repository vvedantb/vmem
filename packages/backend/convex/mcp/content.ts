import { z } from "zod";

export type ToolHandlerResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type McpToolContent = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
};

function textContent(text: string): McpToolContent {
  return { content: [{ type: "text", text }] };
}

function errorContent(message: string): McpToolContent {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function formatToolResult(result: ToolHandlerResult): string {
  if (!result.ok) {
    return JSON.stringify({ error: result.error }, null, 2);
  }
  return JSON.stringify(result.data, null, 2);
}

export function toMcpContent(
  result: ToolHandlerResult,
  errorLabel: string,
): McpToolContent {
  if (!result.ok) return errorContent(`${errorLabel}: ${result.error}`);
  return textContent(formatToolResult(result));
}

const unknownRecordSchema = z.record(z.unknown());

function fileMetadataText(data: unknown): string {
  const parsed = unknownRecordSchema.safeParse(data);
  if (!parsed.success) {
    return JSON.stringify(data, null, 2);
  }
  const clone: Record<string, unknown> = { ...parsed.data };
  delete clone.contentBase64;
  return JSON.stringify(clone, null, 2);
}

const inlineImageFileSchema = z.object({
  contentBase64: z.string(),
  mimeType: z.string().refine((mime) => mime.startsWith("image/")),
});

export function filesGetContent(result: ToolHandlerResult): McpToolContent {
  if (!result.ok) return errorContent(`Files get failed: ${result.error}`);
  const data = result.data;
  const inlineImage = inlineImageFileSchema.safeParse(data);
  if (inlineImage.success) {
    return {
      content: [
        {
          type: "image",
          data: inlineImage.data.contentBase64,
          mimeType: inlineImage.data.mimeType,
        },
        { type: "text", text: fileMetadataText(data) },
      ],
    };
  }
  return textContent(formatToolResult(result));
}
