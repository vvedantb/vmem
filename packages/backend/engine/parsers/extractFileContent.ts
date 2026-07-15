import { extractText } from "unpdf";

export async function extractFileContent(
  blob: Blob,
  kind: "pdf" | "text",
): Promise<string> {
  if (kind === "pdf") {
    const { text } = await extractText(
      new Uint8Array(await blob.arrayBuffer()),
      {
        mergePages: true,
      },
    );
    return text;
  }
  return blob.text();
}
