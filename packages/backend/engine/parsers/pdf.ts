/**
 * PDF text extraction.
 *
 * Wraps `unpdf` (serverless pdf.js). Lives behind a single function so the
 * rest of the codebase stays unaware of the library — if we swap extractors
 * later, only this file changes.
 *
 * Returns the concatenated text of every page (`mergePages: true`). The
 * chunker downstream snaps to whitespace, so we don't post-process here.
 *
 * Accepts a Buffer so this file has no Blob/Convex dependency and can be
 * unit-tested in isolation. Callers convert Blob → Buffer (see
 * extractFileContent).
 */

import { extractText } from "unpdf";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(buffer), {
    mergePages: true,
  });
  return text;
}
