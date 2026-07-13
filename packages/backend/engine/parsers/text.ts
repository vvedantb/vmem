export async function extractTextFromBlob(blob: Blob): Promise<string> {
  return blob.text();
}
