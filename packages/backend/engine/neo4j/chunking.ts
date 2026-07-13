/**
 * Sliding-window chunker for long memory content.
 *
 * Used by the chunk-pipeline action that runs after `createMemory` returns
 * — long PDFs, articles, and pasted documents are split into ~500-token
 * windows with 50-token overlap so retrieval can match against paragraph-
 * sized regions instead of the whole memory.
 *
 * Tokenization is approximated as 4 characters per token (matches OpenAI's
 * rough rule for English prose). This avoids pulling in a tokenizer
 * dependency for what is structurally a heuristic — chunks are not meant
 * to be exact-token-aligned, just consistently sized.
 */

const CHUNK_THRESHOLD_CHARS = 2000;
const TOKENS_PER_CHUNK = 500;
const OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;

const CHUNK_TARGET_CHARS = TOKENS_PER_CHUNK * CHARS_PER_TOKEN; // 2000
const CHUNK_OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN; // 200
const CHUNK_STEP_CHARS = CHUNK_TARGET_CHARS - CHUNK_OVERLAP_CHARS; // 1800

export interface MemoryChunk {
  content: string;
  startOffset: number;
  endOffset: number;
}

/**
 * True when content is long enough to benefit from chunking. Memories under
 * the threshold are kept whole — the memory-level embedding is already a
 * good representation for retrieval.
 */
export function shouldChunk(content: string): boolean {
  return content.length > CHUNK_THRESHOLD_CHARS;
}

/**
 * Find the nearest whitespace boundary on the LEFT of `index` (i.e. the
 * largest position <= index that lies on whitespace). Used to snap chunk
 * ends to word boundaries so we never split a word in half. Falls back to
 * the original index if no whitespace is found within 100 characters
 * (extremely long unbroken token, e.g. base64 blob).
 */
function snapToWordBoundary(text: string, index: number): number {
  if (index >= text.length) return text.length;
  if (index <= 0) return 0;
  const minIndex = Math.max(0, index - 100);
  for (let i = index; i >= minIndex; i--) {
    const ch = text[i];
    if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
      return i;
    }
  }
  return index;
}

/** Snap `index` left to whitespace; if that lands at/before `start`, use `fallback`. */
function snapPastStart(
  text: string,
  index: number,
  start: number,
  fallback: number,
): number {
  const snapped = snapToWordBoundary(text, index);
  return snapped <= start ? fallback : snapped;
}

/**
 * Split `content` into overlapping chunks of approximately CHUNK_TARGET_CHARS
 * characters, stepping by CHUNK_STEP_CHARS so adjacent chunks share
 * CHUNK_OVERLAP_CHARS of context. Snaps chunk boundaries to whitespace so
 * we never break words. Returns at least one chunk, even for short input
 * (caller should gate with `shouldChunk` if it wants to skip short content).
 */
export function chunkText(content: string): MemoryChunk[] {
  if (content.length === 0) return [];
  if (content.length <= CHUNK_TARGET_CHARS) {
    return [
      {
        content,
        startOffset: 0,
        endOffset: content.length,
      },
    ];
  }

  const chunks: MemoryChunk[] = [];
  let start = 0;

  while (start < content.length) {
    const hardEnd = Math.min(start + CHUNK_TARGET_CHARS, content.length);
    const end =
      hardEnd < content.length
        ? snapPastStart(content, hardEnd, start, hardEnd)
        : hardEnd;
    const slice = content.slice(start, end).trim();
    if (slice.length > 0) {
      chunks.push({
        content: slice,
        startOffset: start,
        endOffset: end,
      });
    }
    if (end >= content.length) break;
    const hardNext = start + CHUNK_STEP_CHARS;
    start =
      hardNext < content.length
        ? snapPastStart(content, hardNext, start, hardNext)
        : hardNext;
  }

  return chunks;
}
