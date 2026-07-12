// Shared AST helpers for vmem oxlint rules.

/** True if `node` is an Identifier (optionally with a specific `name`). */
export function isIdentifier(node, name) {
  return (
    node?.type === "Identifier" && (name === undefined || node.name === name)
  );
}

/** Normalise a file path to forward slashes so rules work on Windows too. */
export function toPosix(filename) {
  return (filename ?? "").replace(/\\/g, "/");
}
