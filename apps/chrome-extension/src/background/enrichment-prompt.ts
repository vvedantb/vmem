/**
 * Shared enrichment prompt template for local LLM tag generation.
 * Used by both Chrome Built-in AI and WebLLM.
 */

const MAX_CONTENT_LENGTH = 2000;

function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(" ", maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen);
}

/**
 * Sanitize a tag to lowercase, hyphenated format.
 * e.g. "React Hooks" → "react-hooks"
 */
export function sanitizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .slice(0, 50);
}

/**
 * Build the enrichment prompt for tag generation.
 * Simplified version without related memories (tags only).
 */
export function buildEnrichmentPrompt(title: string, content: string): string {
  return `You are a memory tagging system. Generate 3-5 semantic topic tags for this memory.

Rules:
- Tags should be lowercase, specific, and reusable
- Good examples: "react", "authentication", "graph-algorithms", "typescript", "next-js"
- Avoid generic tags like "programming", "article", "web", "code"
- Return ONLY valid JSON, no other text

Memory:
Title: ${title}
Content: ${truncateAtWord(content, MAX_CONTENT_LENGTH)}

Respond in JSON only:
{"tags": ["tag1", "tag2", "tag3"]}`;
}

/**
 * Parse the LLM response and extract tags.
 * Returns null if parsing fails.
 */
export function parseEnrichmentResponse(raw: string): string[] | null {
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = raw.trim();

    // Remove markdown code block if present
    if (jsonStr.startsWith("```")) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        jsonStr = match[1].trim();
      }
    }

    const parsed: unknown = JSON.parse(jsonStr);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "tags" in parsed &&
      Array.isArray((parsed as { tags: unknown }).tags)
    ) {
      const tags = (parsed as { tags: unknown[] }).tags;
      // Filter to only string tags
      const stringTags = tags.filter(
        (t): t is string => typeof t === "string" && t.length > 0,
      );
      return stringTags.map(sanitizeTag).filter((t) => t.length > 0);
    }

    return null;
  } catch {
    console.error("[enrichment] Failed to parse LLM response:", raw);
    return null;
  }
}
