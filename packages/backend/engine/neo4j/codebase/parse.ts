import { basename, dirname, extname } from "node:path/posix";
import {
  Project,
  ScriptKind,
  SyntaxKind,
  type Node,
  type SourceFile,
  type ClassDeclaration,
  type InterfaceDeclaration,
  type FunctionDeclaration,
  type MethodDeclaration,
  type VariableDeclaration,
  type ExportableNode,
} from "ts-morph";
import type {
  FileNode,
  FunctionNode,
  ClassNode,
  InterfaceNode,
  SymbolNode,
  RelationEdge,
  ParseResult,
} from "./types";
import { convexEntryKind } from "./convexBuilders";

export interface SourceFileBlob {
  // repo-relative path with `/` separators
  path: string;
  // raw text content
  content: string;
}

interface ParseInput {
  codebaseId: string;
  files: SourceFileBlob[];
}

// subset of extensions ts-morph understands
const TS_JS_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);

// extension → ScriptKind
function pickScriptKind(ext: string): ScriptKind {
  switch (ext) {
    case ".tsx":
      return ScriptKind.TSX;
    case ".jsx":
      return ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ScriptKind.JS;
    default:
      return ScriptKind.TS;
  }
}

// repo-root files: posix `dirname("foo.ts")` is `"."`; we store `""`
function directoryOf(repoPath: string): string {
  const dir = dirname(repoPath);
  return dir === "." ? "" : dir;
}

// cheap stable hash (FNV-1a 32-bit) — we only need to detect content changes
function contentHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function fileSymbolId(codebaseId: string, path: string): string {
  return `${codebaseId}:${path}`;
}

function symbolId(
  codebaseId: string,
  path: string,
  symbolPath: string,
): string {
  return `${codebaseId}:${path}:${symbolPath}`;
}

// match any of `.test.`/`.spec.` in filename
function isTestFile(path: string): boolean {
  const filename = basename(path);
  return /\.(test|spec)\.[mc]?[jt]sx?$/.test(filename);
}

// true for a named export or a `export default`
function isExportedNode(node: ExportableNode): boolean {
  return node.isExported() || node.isDefaultExport();
}

function buildProject(input: ParseInput): {
  project: Project;
  loadedPaths: string[];
} {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      // permissive — we want the parser to succeed even on broken code
      allowJs: true,
      checkJs: false,
      noEmit: true,
      target: 99, // ESNext
      module: 99, // NodeNext
      jsx: 1, // Preserve
      skipLibCheck: true,
      strict: false,
    },
  });

  const loadedPaths: string[] = [];
  for (const file of input.files) {
    const ext = extname(file.path);
    if (!TS_JS_EXTENSIONS.has(ext)) continue;
    project.createSourceFile(file.path, file.content, {
      scriptKind: pickScriptKind(ext),
      overwrite: true,
    });
    loadedPaths.push(file.path);
  }
  return { project, loadedPaths };
}

// walk a single source file and emit symbols plus local structural edges
function parseSourceFile(
  codebaseId: string,
  source: SourceFile,
  fileBlob: SourceFileBlob,
  symbols: SymbolNode[],
  relations: RelationEdge[],
): FileNode {
  const path = fileBlob.path;
  const fileId = fileSymbolId(codebaseId, path);
  const ext = extname(path);
  const fileNode: FileNode = {
    kind: "file",
    id: fileId,
    path,
    directory: directoryOf(path),
    filename: basename(path),
    extension: ext,
    sizeBytes: fileBlob.content.length,
    contentHash: contentHash(fileBlob.content),
  };
  symbols.push(fileNode);

  const fileIsTest = isTestFile(path);

  // imports — module path placeholder; resolveCalls patches to file id
  for (const imp of source.getImportDeclarations()) {
    const moduleSpec = imp.getModuleSpecifierValue();
    if (!moduleSpec) continue;
    relations.push({
      kind: "IMPORTS",
      fromId: fileId,
      toId: moduleSpec, // placeholder — resolver replaces with target file id
      confidence: 0,
      tier: "INFERRED",
      importPath: moduleSpec,
    });
  }

  for (const fn of source.getFunctions()) {
    pushFunction(codebaseId, fileId, path, fn, fileIsTest, symbols, relations);
  }

  for (const v of source.getVariableDeclarations()) {
    pushVariableFunction(
      codebaseId,
      fileId,
      path,
      v,
      fileIsTest,
      symbols,
      relations,
    );
  }

  for (const cls of source.getClasses()) {
    pushClass(codebaseId, fileId, path, cls, fileIsTest, symbols, relations);
  }

  for (const iface of source.getInterfaces()) {
    pushInterface(codebaseId, fileId, path, iface, symbols, relations);
  }

  return fileNode;
}

function pushFunction(
  codebaseId: string,
  fileId: string,
  filePath: string,
  fn: FunctionDeclaration,
  fileIsTest: boolean,
  symbols: SymbolNode[],
  relations: RelationEdge[],
): void {
  const name = fn.getName();
  if (!name) return; // anonymous default-export functions are skipped Phase 1
  const id = symbolId(codebaseId, filePath, name);
  const node: FunctionNode = {
    kind: "function",
    id,
    filePath,
    name,
    qualifiedName: `${filePath}::${name}`,
    startLine: fn.getStartLineNumber(),
    endLine: fn.getEndLineNumber(),
    isExported: isExportedNode(fn),
    isAsync: fn.isAsync(),
    isTest: fileIsTest,
    paramCount: fn.getParameters().length,
  };
  symbols.push(node);
  relations.push({ kind: "CONTAINS", fromId: fileId, toId: id });
}

// const/let arrow-fn or fn-expr, or Convex builder call → Function symbol
function pushVariableFunction(
  codebaseId: string,
  fileId: string,
  filePath: string,
  v: VariableDeclaration,
  fileIsTest: boolean,
  symbols: SymbolNode[],
  relations: RelationEdge[],
): void {
  const init = v.getInitializer();
  if (!init) return;
  const isFn =
    init.getKind() === SyntaxKind.ArrowFunction ||
    init.getKind() === SyntaxKind.FunctionExpression;
  if (!isFn && !looksLikeConvexBuilder(init)) return;
  const name = v.getName();
  const id = symbolId(codebaseId, filePath, name);
  const stmt = v.getVariableStatement();
  // async/paramCount only meaningful for actual fn nodes — Convex builder calls
  // get sensible defaults (false/0) so the symbol still records correctly
  symbols.push({
    kind: "function",
    id,
    filePath,
    name,
    qualifiedName: `${filePath}::${name}`,
    startLine: v.getStartLineNumber(),
    endLine: v.getEndLineNumber(),
    isExported: stmt ? isExportedNode(stmt) : false,
    isAsync: isFn && isAsyncFunctionLike(init),
    isTest: fileIsTest,
    paramCount: isFn ? getParamCount(init) : 0,
  });
  relations.push({ kind: "CONTAINS", fromId: fileId, toId: id });
}

// true for `query({...})` / `mutation({...})` / etc
function looksLikeConvexBuilder(init: Node): boolean {
  if (init.getKind() !== SyntaxKind.CallExpression) return false;
  const expr = init.asKindOrThrow(SyntaxKind.CallExpression).getExpression();
  const calleeName = expr.getText();
  return convexEntryKind(calleeName) !== undefined;
}

// cheap `async` check for an arrow-fn / fn-expr node's own text
function isAsyncFunctionLike(node: Node): boolean {
  if (
    node.getKind() === SyntaxKind.ArrowFunction ||
    node.getKind() === SyntaxKind.FunctionExpression
  ) {
    const text = node.getText();
    // cheap match — async always appears at the very start of these forms
    return text.startsWith("async ") || text.includes("async (");
  }
  return false;
}

function getParamCount(node: Node): number {
  const arrow = node.asKind(SyntaxKind.ArrowFunction);
  if (arrow) return arrow.getParameters().length;
  const fn = node.asKind(SyntaxKind.FunctionExpression);
  if (fn) return fn.getParameters().length;
  return 0;
}

function pushClass(
  codebaseId: string,
  fileId: string,
  filePath: string,
  cls: ClassDeclaration,
  fileIsTest: boolean,
  symbols: SymbolNode[],
  relations: RelationEdge[],
): void {
  const name = cls.getName();
  if (!name) return;
  const id = symbolId(codebaseId, filePath, name);
  const extendsExpr = cls.getExtends();
  const extendsName = extendsExpr ? extendsExpr.getText() : undefined;
  const node: ClassNode = {
    kind: "class",
    id,
    filePath,
    name,
    qualifiedName: `${filePath}::${name}`,
    startLine: cls.getStartLineNumber(),
    endLine: cls.getEndLineNumber(),
    isExported: isExportedNode(cls),
    isAbstract: cls.isAbstract(),
    extendsName,
  };
  symbols.push(node);
  relations.push({ kind: "CONTAINS", fromId: fileId, toId: id });

  // extends edge — placeholder, resolver patches
  if (extendsName) {
    relations.push({
      kind: "EXTENDS",
      fromId: id,
      toId: extendsName,
      confidence: 0,
      tier: "INFERRED",
    });
  }
  // implements edges — placeholders, resolver patches
  for (const impl of cls.getImplements()) {
    relations.push({
      kind: "IMPLEMENTS",
      fromId: id,
      toId: impl.getText(),
      confidence: 0,
      tier: "INFERRED",
    });
  }

  // methods
  for (const method of cls.getMethods()) {
    pushMethod(
      codebaseId,
      filePath,
      name,
      method,
      fileIsTest,
      symbols,
      relations,
    );
  }
}

function pushMethod(
  codebaseId: string,
  filePath: string,
  className: string,
  m: MethodDeclaration,
  fileIsTest: boolean,
  symbols: SymbolNode[],
  relations: RelationEdge[],
): void {
  const methodName = m.getName();
  const symbolPath = `${className}.${methodName}`;
  const classId = symbolId(codebaseId, filePath, className);
  const id = symbolId(codebaseId, filePath, symbolPath);
  const node: FunctionNode = {
    kind: "function",
    id,
    filePath,
    name: methodName,
    qualifiedName: `${filePath}::${symbolPath}`,
    parentClass: className,
    startLine: m.getStartLineNumber(),
    endLine: m.getEndLineNumber(),
    isExported: false, // method export-ness is class-level
    isAsync: m.isAsync(),
    isTest: fileIsTest,
    paramCount: m.getParameters().length,
  };
  symbols.push(node);
  relations.push({ kind: "HAS_METHOD", fromId: classId, toId: id });
}

function pushInterface(
  codebaseId: string,
  fileId: string,
  filePath: string,
  iface: InterfaceDeclaration,
  symbols: SymbolNode[],
  relations: RelationEdge[],
): void {
  const name = iface.getName();
  const id = symbolId(codebaseId, filePath, name);
  const node: InterfaceNode = {
    kind: "interface",
    id,
    filePath,
    name,
    qualifiedName: `${filePath}::${name}`,
    startLine: iface.getStartLineNumber(),
    endLine: iface.getEndLineNumber(),
    isExported: isExportedNode(iface),
  };
  symbols.push(node);
  relations.push({ kind: "CONTAINS", fromId: fileId, toId: id });
}

export function parseRepository(input: ParseInput): {
  project: Project;
  result: ParseResult;
} {
  const { project, loadedPaths } = buildProject(input);
  const symbols: SymbolNode[] = [];
  const structuralRelations: RelationEdge[] = [];

  const blobByPath = new Map(input.files.map((f) => [f.path, f]));

  for (const path of loadedPaths) {
    const source = project.getSourceFile(path);
    const blob = blobByPath.get(path);
    if (!source || !blob) continue;
    parseSourceFile(
      input.codebaseId,
      source,
      blob,
      symbols,
      structuralRelations,
    );
  }

  return {
    project,
    result: { symbols, structuralRelations },
  };
}
