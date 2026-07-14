export type WikiNodeKind = "folder" | "document" | "artifact";

// folders are structure-only; documents and artifacts carry editable bodies
export function wikiKindHasContent(kind: WikiNodeKind): boolean {
  return kind === "document" || kind === "artifact";
}
