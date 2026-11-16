// Shared AST helpers for vmem oxlint rules.

/** Normalise a file path to forward slashes so rules work on Windows too. */
export function toPosix(filename) {
  return (filename ?? "").replace(/\\/g, "/");
}
