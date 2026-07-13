/**
 * PDF text extraction.
 *
 * Wraps `pdf-parse`, the de-facto Node PDF text extractor. Lives behind
 * a single function so the rest of the codebase stays unaware of the
 * library — if we swap to a better extractor later (pdfjs-dist, unpdf)
 * only this file changes.
 *
 * Returns the concatenated text of every page, with whitespace preserved
 * as `pdf-parse` produces it (it inserts `\n` per line and `\n\n`-style
 * gaps for page breaks). The chunker downstream snaps to whitespace, so
 * we don't post-process here.
 *
 * Accepts a Buffer so this file has no Blob/Convex dependency and can be
 * unit-tested in isolation. Callers convert Blob → Buffer (see
 * extractFileContent).
 */

import pdfParse from "pdf-parse";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  return (await pdfParse(buffer)).text;
}
