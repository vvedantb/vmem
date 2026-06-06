/**
 * Lightweight import-path extractor. Phase 1 demoted this from the
 * primary parser to a small back-compat shim — actual edge resolution
 * happens via ts-morph in `codebase/parse.ts` + `codebase/resolveCalls.ts`.
 *
 * This file remains because (a) callers in older code paths still
 * import it and (b) it's handy when you need just the raw import
 * specifiers without spinning up a full `Project`. It delegates to
 * ts-morph for accuracy (named bindings + dynamic imports + re-exports).
 */

import { Project, ScriptKind, SyntaxKind } from "ts-morph";

/**
 * Extract every relative-import specifier (i.e. starting with `.`) from
 * a TS/JS source string. Static `import`, dynamic `import(...)`,
 * `require(...)`, and re-export `export ... from "..."` all qualify.
 */
export function parseImports(content: string): string[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      noEmit: true,
      target: 99,
      module: 99,
      jsx: 1,
      strict: false,
    },
  });
  const source = project.createSourceFile("__tmp__.tsx", content, {
    scriptKind: ScriptKind.TSX,
    overwrite: true,
  });
  const out: string[] = [];

  for (const imp of source.getImportDeclarations()) {
    const v = imp.getModuleSpecifierValue();
    if (v && v.startsWith(".") && !out.includes(v)) out.push(v);
  }
  for (const exp of source.getExportDeclarations()) {
    const v = exp.getModuleSpecifierValue();
    if (v && v.startsWith(".") && !out.includes(v)) out.push(v);
  }
  for (const ce of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const text = ce.getText();
    const m = /^(?:import|require)\s*\(\s*(['"])(\.[^'"]+)\1\s*\)/.exec(text);
    if (m && m[2] && !out.includes(m[2])) out.push(m[2]);
  }
  return out;
}

/**
 * Resolve a relative import path to an actual file in the tree. Tries
 * `.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs` and index files. Pure path
 * arithmetic — the AST-aware module-graph build uses the type-checker
 * in `codebase/resolveCalls.ts`, so this helper is only useful as a
 * fallback for code that has the file tree but not a `Project`.
 */
export function resolveImportPath(
  importPath: string,
  fromFilePath: string,
  fileTree: Set<string>,
): string | null {
  const fromDir = fromFilePath.substring(0, fromFilePath.lastIndexOf("/"));
  const resolved = normalizePath(`${fromDir}/${importPath}`);

  if (fileTree.has(resolved)) return resolved;

  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
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
