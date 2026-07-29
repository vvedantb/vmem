// wiki node kinds, shared so the backend and the dashboard cannot drift
export type WikiNodeKind = "folder" | "document" | "artifact";

// folders are structure-only; documents and artifacts carry editable bodies
export function wikiKindHasContent(kind: WikiNodeKind): boolean {
  return kind === "document" || kind === "artifact";
}

export function wikiKindLabel(kind: WikiNodeKind): string {
  if (kind === "folder") return "folder";
  if (kind === "artifact") return "artifact";
  return "document";
}
