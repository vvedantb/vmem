/**
 * Pure tag normalization — no driver imports, safe for any Convex runtime
 * (the V8-runtime prompt builders import from here; getTopTags and other
 * Neo4j queries live in tags.ts, which is "use node"-only territory).
 *
 * Why this exists: tags are only useful when REUSED — they are the connective
 * tissue between memories (tag edges in the graph, filters, clustering). An
 * audit found 73% of one user's 4,962 tags were used exactly once, because
 * (a) the enrichment prompt rewarded hyper-specific one-off tags and never saw
 * the user's existing vocabulary, and (b) client-supplied tags (MCP tools,
 * HTTP API) reached Cypher unnormalized ("GCP" vs "gcp" mint separate nodes).
 */

/**
 * Canonical tag shape: lowercase, hyphen-separated, alphanumeric, ≤50 chars,
 * no leading/trailing/doubled hyphens (" Gcp " must equal "gcp", not "gcp-").
 */
export function sanitizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 50)
    .replace(/^-+|-+$/g, "");
}

/**
 * Chokepoint normalization for every tag write (create, update, enrichment,
 * MCP, HTTP). Sanitizes, drops empties, dedupes, caps. Order-preserving.
 */
export function normalizeTags(tags: string[], max: number = 10): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = sanitizeTag(raw);
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= max) break;
  }
  return result;
}

export interface TagUsage {
  name: string;
  uses: number;
}
