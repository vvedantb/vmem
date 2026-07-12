import { extractPdfText } from "./pdf";
import { extractTextFromBlob } from "./text";

export async function extractFileContent(
  blob: Blob,
  kind: "pdf" | "text",
): Promise<string> {
  if (kind === "pdf") {
    const arrayBuffer = await blob.arrayBuffer();
    return extractPdfText(Buffer.from(arrayBuffer));
  }
  return extractTextFromBlob(blob);
}
