/**
 * Escape user/agent text for Neo4j fulltext indexes (Apache Lucene query parser).
 * Characters like `/`, `+`, and `:` are valid in memory content but break parsing
 * when passed through unchanged.
 */

const LUCENE_SPECIAL_CHARS = /[+\-!(){}[\]^"~*?:\\\/]/g;

export function escapeLuceneQuery(text: string): string {
  return text.replace(LUCENE_SPECIAL_CHARS, "\\$&");
}

/**
 * Build a safe `memory_content` fulltext query. Returns null when input is empty.
 */
export function toMemoryContentFulltextQuery(userQuery: string): string | null {
  const trimmed = userQuery.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return escapeLuceneQuery(trimmed);
}
