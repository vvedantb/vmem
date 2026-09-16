export function buildSearchableText(
  title: string,
  content: string,
  tags: readonly string[],
): string {
  return [title, content, ...tags]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n");
}

export const MEMORY_EMBEDDING_DIMENSIONS = 1536;
