/**
 * Markdown ↔ TipTap JSON conversion for wiki MCP writes.
 * Matches StarterKit shapes the web WikiEditor loads via contentJson.
 */

export interface WikiTextNode {
  type: "text";
  text: string;
}

export interface WikiBlockNode {
  type: string;
  attrs?: { level?: number; language?: string };
  content?: WikiNode[];
}

export type WikiNode = WikiTextNode | WikiBlockNode;

export interface WikiDoc {
  type: "doc";
  content: WikiBlockNode[];
}

const EMPTY_DOC: WikiDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [] }],
};

function isWikiTextNode(node: WikiNode): node is WikiTextNode {
  return node.type === "text";
}

function nodeText(node: WikiNode): string {
  if (isWikiTextNode(node)) {
    return node.text;
  }
  if (!node.content) {
    return "";
  }
  return node.content.map(nodeText).join("");
}

/** Flatten TipTap JSON for Convex full-text search (mirrors web docToPlainText). */
export function wikiDocToPlainText(doc: WikiDoc): string {
  function walk(node: WikiNode): string {
    if (isWikiTextNode(node)) {
      return node.text;
    }
    const children = (node.content ?? []).map(walk).join("");
    if (node.type === "paragraph" || node.type === "heading") {
      return children + "\n";
    }
    return children;
  }
  return walk(doc).trim();
}

function parseWikiDoc(contentJson: string): WikiDoc | null {
  if (contentJson.length === 0) {
    return null;
  }
  try {
    const parsed: WikiDoc = JSON.parse(contentJson);
    if (parsed.type !== "doc" || !Array.isArray(parsed.content)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function wikiStorageToMarkdown(
  contentJson: string | undefined,
  contentText: string | undefined,
): string {
  const doc = contentJson ? parseWikiDoc(contentJson) : null;
  if (doc) {
    return wikiDocToMarkdown(doc);
  }
  return contentText ?? "";
}

export function wikiDocToMarkdown(doc: WikiDoc): string {
  const parts: string[] = [];

  for (const block of doc.content) {
    if (block.type === "heading") {
      const level =
        typeof block.attrs?.level === "number" ? block.attrs.level : 1;
      const hashes = "#".repeat(Math.min(Math.max(level, 1), 6));
      parts.push(`${hashes} ${nodeText(block).trim()}`);
      continue;
    }
    if (block.type === "paragraph") {
      const text = nodeText(block).trim();
      if (text.length > 0) {
        parts.push(text);
      }
      continue;
    }
    if (block.type === "bulletList") {
      const items: string[] = [];
      for (const item of block.content ?? []) {
        if (item.type === "listItem") {
          items.push(`- ${nodeText(item).trim()}`);
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
      const code = nodeText(block);
      parts.push(`\`\`\`${language}\n${code}\n\`\`\``);
      continue;
    }
    const fallback = nodeText(block).trim();
    if (fallback.length > 0) {
      parts.push(fallback);
    }
  }

  return parts.join("\n\n").trim();
}

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

export function markdownToWikiDoc(markdown: string): WikiDoc {
  const trimmed = markdown.trim();
  if (trimmed.length === 0) {
    return EMPTY_DOC;
  }

  const lines = trimmed.split(/\r?\n/);
  const blocks: WikiBlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({
        type: "codeBlock",
        attrs: language.length > 0 ? { language } : undefined,
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: [{ type: "text", text: headingMatch[2] }],
      });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: WikiBlockNode[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        const itemText = lines[index].replace(/^[-*]\s+/, "");
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content:
                itemText.length > 0 ? [{ type: "text", text: itemText }] : [],
            },
          ],
        });
        index += 1;
      }
      blocks.push({ type: "bulletList", content: items });
      continue;
    }

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (current.trim().length === 0) {
        break;
      }
      if (current.startsWith("```")) {
        break;
      }
      if (/^(#{1,6})\s+/.test(current)) {
        break;
      }
      if (/^[-*]\s+/.test(current)) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        content: [{ type: "text", text: paragraphLines.join("\n") }],
      });
    }
  }

  if (blocks.length === 0) {
    return EMPTY_DOC;
  }

  return { type: "doc", content: blocks };
}

export function markdownToWikiStorage(markdown: string): {
  contentJson: string;
  contentText: string;
} {
  const doc = markdownToWikiDoc(markdown);
  return {
    contentJson: JSON.stringify(doc),
    contentText: wikiDocToPlainText(doc),
  };
}

export function wikiExcerpt(text: string, maxLength = 200): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}…`;
}
