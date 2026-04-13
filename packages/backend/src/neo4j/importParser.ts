/**
 * Parse relative imports from TypeScript/JavaScript source code.
 * Returns an array of raw import path strings (starting with . or ..)
 */
export function parseImports(content: string): string[] {
  const imports: string[] = [];

  const patterns = [
    /import\s+(?:[\s\S]*?)\s+from\s+['"](\.[^'"]+)['"]/g,
    /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    /export\s+(?:[\s\S]*?)\s+from\s+['"](\.[^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(content);
    while (match !== null) {
      const importPath = match[1];
      if (importPath && !imports.includes(importPath)) {
        imports.push(importPath);
      }
      match = pattern.exec(content);
    }
  }

  return imports;
}

/**
 * Resolve a relative import path to an actual file in the tree.
 * Tries extensions: .ts, .tsx, .js, .jsx and index files.
 */
export function resolveImportPath(
  importPath: string,
  fromFilePath: string,
  fileTree: Set<string>,
): string | null {
  const fromDir = fromFilePath.substring(0, fromFilePath.lastIndexOf("/"));
  const resolved = normalizePath(`${fromDir}/${importPath}`);

  if (fileTree.has(resolved)) return resolved;

  const extensions = [".ts", ".tsx", ".js", ".jsx"];
  for (const ext of extensions) {
    if (fileTree.has(resolved + ext)) return resolved + ext;
  }

  for (const ext of extensions) {
    if (fileTree.has(`${resolved}/index${ext}`))
      return `${resolved}/index${ext}`;
  }

  return null;
}

function normalizePath(path: string): string {
  const parts = path.split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      result.pop();
    } else {
      result.push(part);
    }
  }
  return result.join("/");
}
