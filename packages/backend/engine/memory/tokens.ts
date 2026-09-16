const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "me",
  "my",
  "no",
  "not",
  "of",
  "on",
  "or",
  "please",
  "should",
  "so",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "too",
  "user",
  "users",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

export function tokenize(text: string): string[] {
  const parts = text.toLowerCase().split(/[^a-z0-9]+/);
  const tokens: string[] = [];
  for (const part of parts) {
    if (part.length === 0) continue;
    tokens.push(part);
  }
  return tokens;
}

export function stem(token: string): string {
  if (token.length <= 3) return token;
  let next = token;
  if (next.endsWith("ies") && next.length > 4) {
    next = `${next.slice(0, -3)}y`;
  } else if (next.endsWith("ing") && next.length > 5) {
    next = next.slice(0, -3);
  } else if (next.endsWith("ed") && next.length > 4) {
    next = next.slice(0, -2);
  } else if (next.endsWith("es") && next.length > 4) {
    next = next.slice(0, -2);
  } else if (next.endsWith("s") && next.length > 3 && !next.endsWith("ss")) {
    next = next.slice(0, -1);
  }
  if (
    next.length > 3 &&
    next.at(-1) === next.at(-2) &&
    next.at(-1) !== "s" &&
    next.at(-1) !== "e"
  ) {
    next = next.slice(0, -1);
  }
  return next;
}

export function contentTokens(text: string, dropStopwords: boolean): string[] {
  const tokens: string[] = [];
  for (const token of tokenize(text)) {
    if (dropStopwords && STOPWORDS.has(token)) continue;
    tokens.push(stem(token));
  }
  return tokens;
}

export function uniqueTokens(tokens: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}
