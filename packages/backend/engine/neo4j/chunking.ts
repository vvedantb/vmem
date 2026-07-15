const CHUNK_THRESHOLD_CHARS = 2000;
const TOKENS_PER_CHUNK = 500;
const OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;

const CHUNK_TARGET_CHARS = TOKENS_PER_CHUNK * CHARS_PER_TOKEN;
const CHUNK_OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;
const CHUNK_STEP_CHARS = CHUNK_TARGET_CHARS - CHUNK_OVERLAP_CHARS;

export interface MemoryChunk {
  content: string;
  startOffset: number;
  endOffset: number;
}

export function shouldChunk(content: string): boolean {
  return content.length > CHUNK_THRESHOLD_CHARS;
}

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

function snapPastStart(
  text: string,
  index: number,
  start: number,
  fallback: number,
): number {
  const snapped = snapToWordBoundary(text, index);
  return snapped <= start ? fallback : snapped;
}

// AI-generated (Claude), prompt: "chunk long memory text into overlapping windows snapped to word boundaries"
// Modified by me: chose 500 token window 50 overlap and 2000 char gate
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
