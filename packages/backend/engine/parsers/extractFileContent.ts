import { extractText } from "unpdf";

export async function extractFileContent(
  blob: Blob,
  kind: "pdf" | "text",
): Promise<string> {
  if (kind === "pdf") {
    const buffer = Buffer.from(await blob.arrayBuffer());
    const { text } = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    return text;
  }
  return blob.text();
}
