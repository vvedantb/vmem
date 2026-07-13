/**
 * Plain-text and Markdown extraction.
 *
 * `Blob.text()` already does the right thing: decodes as UTF-8 by default
 * with replacement for invalid sequences (matches what users expect when
 * uploading a `.txt` or `.md` file). No pre-processing — chunking and
 * embedding work on raw text.
 */

export async function extractTextFromBlob(blob: Blob): Promise<string> {
  return blob.text();
}
