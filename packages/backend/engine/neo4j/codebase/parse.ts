import { basename, dirname, extname } from "node:path/posix";
import {
  Project,
  ScriptKind,
  Node,
  type SourceFile,
  type ClassDeclaration,
  type InterfaceDeclaration,
  type FunctionDeclaration,
  type MethodDeclaration,
  type VariableDeclaration,
  type ExportableNode,
} from "ts-morph";
import type {
  FunctionNode,
  SymbolNode,
  RelationEdge,
  ParseResult,
} from "./types";
import { CONFIDENCE_BY_TIER } from "./types";
import { convexEntryKind } from "./convexBuilders";

export interface SourceFileBlob {
  path: string;
  content: string;
}

interface ParseInput {
  codebaseId: string;
  files: SourceFileBlob[];
}

interface ParseContext {
  codebaseId: string;
  fileIdByPath: Map<string, string>;
  symbols: SymbolNode[];
  structuralRelations: RelationEdge[];
  byFileAndName: Map<string, Map<string, string>>;
  byNameGlobal: Map<string, Set<string>>;
}

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

export function normalizeRepoPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

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

function directoryOf(repoPath: string): string {
  const dir = dirname(repoPath);
  return dir === "." ? "" : dir;
}

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

function isTestFile(path: string): boolean {
  const filename = basename(path);
  return /\.(test|spec)\.[mc]?[jt]sx?$/.test(filename);
}

function isExportedNode(node: ExportableNode): boolean {
  return node.isExported() || node.isDefaultExport();
}

function buildProject(input: ParseInput): Project {
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
      skipLibCheck: true,
      strict: false,
    },
  });

  for (const file of input.files) {
    const ext = extname(file.path);
    if (!TS_JS_EXTENSIONS.has(ext)) continue;
    project.createSourceFile(file.path, file.content, {
      scriptKind: pickScriptKind(ext),
      overwrite: true,
    });
  }
  return project;
}

function registerSymbol(ctx: ParseContext, sym: SymbolNode): void {
  ctx.symbols.push(sym);
  if (sym.kind === "file") return;

  let perFile = ctx.byFileAndName.get(sym.filePath);
  if (!perFile) {
    perFile = new Map();
    ctx.byFileAndName.set(sym.filePath, perFile);
  }
  perFile.set(sym.name, sym.id);

  let global = ctx.byNameGlobal.get(sym.name);
  if (!global) {
    global = new Set();
    ctx.byNameGlobal.set(sym.name, global);
  }
  global.add(sym.id);
}

function resolveHeritageTarget(
  ctx: ParseContext,
  fromFilePath: string,
  targetName: string,
  wantKind: "class" | "interface",
): { id: string; tier: "INFERRED" | "AMBIGUOUS" } | null {
  const localId = ctx.byFileAndName.get(fromFilePath)?.get(targetName);
  const localSym = localId
    ? ctx.symbols.find((s) => s.id === localId)
    : undefined;
  if (localSym?.kind === wantKind && localId !== undefined) {
    return { id: localId, tier: "INFERRED" };
  }

  const candidates = ctx.byNameGlobal.get(targetName);
  if (!candidates || candidates.size === 0) return null;

  const filtered = [...candidates].filter((cid) => {
    const sym = ctx.symbols.find((s) => s.id === cid);
    return sym?.kind === wantKind;
  });
  const first = filtered.at(0);
  if (filtered.length === 1 && first !== undefined) {
    return { id: first, tier: "INFERRED" };
  }
  if (filtered.length === 0 || first === undefined) return null;
  return { id: first, tier: "AMBIGUOUS" };
}

function resolveHeritageTargets(ctx: ParseContext): void {
  for (const edge of ctx.structuralRelations) {
    if (edge.kind !== "EXTENDS" && edge.kind !== "IMPLEMENTS") continue;
    const fromSym = ctx.symbols.find(
      (s) => s.id === edge.fromId && s.kind === "class",
    );
    if (!fromSym || fromSym.kind !== "class") continue;

    const wantKind = edge.kind === "EXTENDS" ? "class" : "interface";
    const targetName = edge.toId;
    const resolved = resolveHeritageTarget(
      ctx,
      fromSym.filePath,
      targetName,
      wantKind,
    );
    if (!resolved) {
      edge.toId = "";
      continue;
    }
    edge.toId = resolved.id;
    edge.confidence = CONFIDENCE_BY_TIER[resolved.tier];
    edge.tier = resolved.tier;
  }

  ctx.structuralRelations = ctx.structuralRelations.filter(
    (e) => e.toId !== "",
  );
}

function pushFunction(
  ctx: ParseContext,
  fileId: string,
  filePath: string,
  fn: FunctionDeclaration,
  fileIsTest: boolean,
): void {
  const name = fn.getName();
  if (!name) return;
  const id = symbolId(ctx.codebaseId, filePath, name);
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
  registerSymbol(ctx, node);
  ctx.structuralRelations.push({ kind: "CONTAINS", fromId: fileId, toId: id });
}

function pushVariableFunction(
  ctx: ParseContext,
  fileId: string,
  filePath: string,
  v: VariableDeclaration,
  fileIsTest: boolean,
): void {
  const init = v.getInitializer();
  if (!init) return;
  const isFn = Node.isArrowFunction(init) || Node.isFunctionExpression(init);
  const entryKind = Node.isCallExpression(init)
    ? convexEntryKind(init.getExpression().getText())
    : undefined;
  if (!isFn && !entryKind) return;
  const name = v.getName();
  const id = symbolId(ctx.codebaseId, filePath, name);
  const stmt = v.getVariableStatement();
  registerSymbol(ctx, {
    kind: "function",
    id,
    filePath,
    name,
    qualifiedName: `${filePath}::${name}`,
    startLine: v.getStartLineNumber(),
    endLine: v.getEndLineNumber(),
    isExported: stmt ? isExportedNode(stmt) : false,
    isAsync: isFn && init.isAsync(),
    isTest: fileIsTest,
    paramCount: isFn ? init.getParameters().length : 0,
    entryKind,
  });
  ctx.structuralRelations.push({ kind: "CONTAINS", fromId: fileId, toId: id });
}

function pushMethod(
  ctx: ParseContext,
  filePath: string,
  className: string,
  m: MethodDeclaration,
  fileIsTest: boolean,
): void {
  const methodName = m.getName();
  const symbolPath = `${className}.${methodName}`;
  const classId = symbolId(ctx.codebaseId, filePath, className);
  const id = symbolId(ctx.codebaseId, filePath, symbolPath);
  registerSymbol(ctx, {
    kind: "function",
    id,
    filePath,
    name: methodName,
    qualifiedName: `${filePath}::${symbolPath}`,
    parentClass: className,
    startLine: m.getStartLineNumber(),
    endLine: m.getEndLineNumber(),
    isExported: false,
    isAsync: m.isAsync(),
    isTest: fileIsTest,
    paramCount: m.getParameters().length,
  });
  ctx.structuralRelations.push({
    kind: "HAS_METHOD",
    fromId: classId,
    toId: id,
  });
}

function pushClass(
  ctx: ParseContext,
  fileId: string,
  filePath: string,
  cls: ClassDeclaration,
  fileIsTest: boolean,
): void {
  const name = cls.getName();
  if (!name) return;
  const id = symbolId(ctx.codebaseId, filePath, name);
  const extendsExpr = cls.getExtends();
  const extendsName = extendsExpr ? extendsExpr.getText() : undefined;
  registerSymbol(ctx, {
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
  });
  ctx.structuralRelations.push({ kind: "CONTAINS", fromId: fileId, toId: id });

  if (extendsName) {
    ctx.structuralRelations.push({
      kind: "EXTENDS",
      fromId: id,
      toId: extendsName,
      confidence: 0,
      tier: "INFERRED",
    });
  }
  for (const impl of cls.getImplements()) {
    ctx.structuralRelations.push({
      kind: "IMPLEMENTS",
      fromId: id,
      toId: impl.getText(),
      confidence: 0,
      tier: "INFERRED",
    });
  }

  for (const method of cls.getMethods()) {
    pushMethod(ctx, filePath, name, method, fileIsTest);
  }
}

function pushInterface(
  ctx: ParseContext,
  fileId: string,
  filePath: string,
  iface: InterfaceDeclaration,
): void {
  const name = iface.getName();
  const id = symbolId(ctx.codebaseId, filePath, name);
  registerSymbol(ctx, {
    kind: "interface",
    id,
    filePath,
    name,
    qualifiedName: `${filePath}::${name}`,
    startLine: iface.getStartLineNumber(),
    endLine: iface.getEndLineNumber(),
    isExported: isExportedNode(iface),
  });
  ctx.structuralRelations.push({ kind: "CONTAINS", fromId: fileId, toId: id });
}

function parseSourceFile(ctx: ParseContext, source: SourceFile): void {
  const path = normalizeRepoPath(source.getFilePath());
  const fileId = ctx.fileIdByPath.get(path);
  if (!fileId) return;
  const fileIsTest = isTestFile(path);

  for (const imp of source.getImportDeclarations()) {
    const moduleSpec = imp.getModuleSpecifierValue();
    if (!moduleSpec) continue;
    const resolved = imp.getModuleSpecifierSourceFile();
    const targetId = resolved
      ? ctx.fileIdByPath.get(normalizeRepoPath(resolved.getFilePath()))
      : undefined;
    ctx.structuralRelations.push({
      kind: "IMPORTS",
      fromId: fileId,
      toId: targetId ?? "",
      confidence: targetId ? CONFIDENCE_BY_TIER.EXTRACTED : 0,
      tier: targetId ? "EXTRACTED" : "INFERRED",
      importPath: moduleSpec,
    });
  }

  for (const fn of source.getFunctions()) {
    pushFunction(ctx, fileId, path, fn, fileIsTest);
  }
  for (const v of source.getVariableDeclarations()) {
    pushVariableFunction(ctx, fileId, path, v, fileIsTest);
  }
  for (const cls of source.getClasses()) {
    pushClass(ctx, fileId, path, cls, fileIsTest);
  }
  for (const iface of source.getInterfaces()) {
    pushInterface(ctx, fileId, path, iface);
  }
}

export function parseRepository(input: ParseInput): {
  project: Project;
  result: ParseResult;
} {
  const project = buildProject(input);
  const ctx: ParseContext = {
    codebaseId: input.codebaseId,
    fileIdByPath: new Map(),
    symbols: [],
    structuralRelations: [],
    byFileAndName: new Map(),
    byNameGlobal: new Map(),
  };

  for (const source of project.getSourceFiles()) {
    const path = normalizeRepoPath(source.getFilePath());
    const content = source.getFullText();
    const fileId = fileSymbolId(ctx.codebaseId, path);
    ctx.fileIdByPath.set(path, fileId);
    const ext = extname(path);
    registerSymbol(ctx, {
      kind: "file",
      id: fileId,
      path,
      directory: directoryOf(path),
      filename: basename(path),
      extension: ext,
      sizeBytes: content.length,
      contentHash: contentHash(content),
    });
  }

  for (const source of project.getSourceFiles()) {
    parseSourceFile(ctx, source);
  }

  resolveHeritageTargets(ctx);

  return {
    project,
    result: {
      symbols: ctx.symbols,
      structuralRelations: ctx.structuralRelations,
    },
  };
}
