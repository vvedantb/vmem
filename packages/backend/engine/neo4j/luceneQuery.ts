const LUCENE_SPECIAL_CHARS = /[+\-!(){}[\]^"~*?:\\/]/g;

export function escapeLuceneQuery(text: string): string {
  return text.replace(LUCENE_SPECIAL_CHARS, "\\$&");
}

export function toMemoryContentFulltextQuery(userQuery: string): string | null {
  const trimmed = userQuery.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return escapeLuceneQuery(trimmed);
}
