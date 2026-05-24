/**
 * Wiki content helpers — markdown is canonical in Convex.
 * JSON conversion exists only for one-time migration off legacy contentJson.
 */

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

/** Plain-text mirror for Convex full-text search (derived from markdown on write). */
export function markdownToPlainText(markdown: string): string {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, (block) => {
    return block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
  });
  return withoutCode
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

interface LegacyWikiTextNode {
  type: "text";
  text: string;
}

interface LegacyWikiBlockNode {
  type: string;
  attrs?: { level?: number; language?: string };
  content?: LegacyWikiNode[];
}

type LegacyWikiNode = LegacyWikiTextNode | LegacyWikiBlockNode;

interface LegacyWikiDoc {
  type: "doc";
  content: LegacyWikiBlockNode[];
}

function legacyNodeText(node: LegacyWikiNode): string {
  if (node.type === "text") {
    return node.text;
  }
  if (!node.content) {
    return "";
  }
  return node.content.map(legacyNodeText).join("");
}

function legacyDocToMarkdown(doc: LegacyWikiDoc): string {
  const parts: string[] = [];
  for (const block of doc.content) {
    if (block.type === "heading") {
      const level =
        typeof block.attrs?.level === "number" ? block.attrs.level : 1;
      const hashes = "#".repeat(Math.min(Math.max(level, 1), 6));
      parts.push(`${hashes} ${legacyNodeText(block).trim()}`);
      continue;
    }
    if (block.type === "paragraph") {
      const text = legacyNodeText(block).trim();
      if (text.length > 0) {
        parts.push(text);
      }
      continue;
    }
    if (block.type === "bulletList") {
      const items: string[] = [];
      for (const item of block.content ?? []) {
        if (item.type === "listItem") {
          items.push(`- ${legacyNodeText(item).trim()}`);
        }
      }
      if (items.length > 0) {
        parts.push(items.join("\n"));
      }
      continue;
    }
    if (block.type === "codeBlock") {
      const language =
        typeof block.attrs?.language === "string" ? block.attrs.language : "";
      const code = legacyNodeText(block);
      parts.push(`\`\`\`${language}\n${code}\n\`\`\``);
      continue;
    }
    const fallback = legacyNodeText(block).trim();
    if (fallback.length > 0) {
      parts.push(fallback);
    }
  }
  return parts.join("\n\n").trim();
}

/** One-time migration: legacy TipTap JSON → markdown. */
export function legacyJsonToMarkdown(
  contentJson: string | undefined,
  contentText: string | undefined,
): string {
  if (contentJson === undefined || contentJson.length === 0) {
    return contentText ?? "";
  }
  try {
    const parsed: LegacyWikiDoc = JSON.parse(contentJson);
    if (parsed.type === "doc" && Array.isArray(parsed.content)) {
      return legacyDocToMarkdown(parsed);
    }
  } catch {
    // fall through
  }
  return contentText ?? "";
}
