import removeMarkdown from "remove-markdown";

export function mergeMarkdownForAppend(
  existing: string,
  addition: string,
): string {
  const left = existing.trimEnd();
  const right = addition.trimStart();
  if (left.length === 0) {
    return right;
  }
  if (right.length === 0) {
    return left;
  }
  return `${left}\n\n${right}`;
}

export function wikiExcerpt(text: string, maxLength = 200): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}…`;
}

// plain-text mirror for convex full-text search
export function markdownToPlainText(markdown: string): string {
  return removeMarkdown(markdown)
    .replace(/\n{2,}/g, "\n")
    .trim();
}
