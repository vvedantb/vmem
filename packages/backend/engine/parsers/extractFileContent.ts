import { extractPdfText } from "./pdf";
import { extractTextFromBlob } from "./text";

export async function extractFileContent(
  blob: Blob,
  kind: "pdf" | "text",
): Promise<string> {
  if (kind === "pdf") {
    return extractPdfText(Buffer.from(await blob.arrayBuffer()));
  }
  return extractTextFromBlob(blob);
}
