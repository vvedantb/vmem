import {
  Node,
  SyntaxKind,
  type Project,
  type CallExpression,
  type SourceFile,
} from "ts-morph";
import {
  CONFIDENCE_BY_TIER,
  type ParseResult,
  type RelationEdge,
  type SymbolNode,
  type FunctionNode,
} from "./types";
import { normalizeRepoPath } from "./parse";

interface SymbolIndex {
  functionsById: Map<string, FunctionNode>;
  byFileAndName: Map<string, Map<string, string>>;
  byNameGlobal: Map<string, Set<string>>;
}

function buildIndex(symbols: SymbolNode[]): SymbolIndex {
  const functionsById = new Map<string, FunctionNode>();
  const byFileAndName = new Map<string, Map<string, string>>();
  const byNameGlobal = new Map<string, Set<string>>();

  for (const sym of symbols) {
    if (sym.kind === "function") functionsById.set(sym.id, sym);
    if (sym.kind === "file") continue;

    let perFile = byFileAndName.get(sym.filePath);
    if (!perFile) {
      perFile = new Map();
      byFileAndName.set(sym.filePath, perFile);
    }
    perFile.set(sym.name, sym.id);

    let global = byNameGlobal.get(sym.name);
    if (!global) {
      global = new Set();
      byNameGlobal.set(sym.name, global);
    }
    global.add(sym.id);
  }

  return { functionsById, byFileAndName, byNameGlobal };
}

function lookupByName(
  perFile: Map<string, string>,
  name: string | undefined,
): string | null {
  if (!name) return null;
  return perFile.get(name) ?? null;
}

function findEnclosingFunctionId(
  call: CallExpression,
  perFile: Map<string, string>,
): string | null {
  let ancestor = call.getParent();
  while (ancestor) {
    if (Node.isFunctionDeclaration(ancestor)) {
      const id = lookupByName(perFile, ancestor.getName());
      if (id) return id;
    } else if (Node.isMethodDeclaration(ancestor)) {
      const methodName = ancestor.getName();
      const cls = ancestor.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
      const className = cls?.getName();
      const id =
        methodName && className
          ? lookupByName(perFile, `${className}.${methodName}`)
          : null;
      if (id) return id;
    } else if (Node.isVariableDeclaration(ancestor)) {
      const id = lookupByName(perFile, ancestor.getName());
      if (id) return id;
    }
    ancestor = ancestor.getParent();
  }
  return null;
}

function getCalleeName(call: CallExpression): string {
  const expr = call.getExpression();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return expr.getText();
}

function getDeclName(decl: Node): string | null {
  if (Node.isFunctionDeclaration(decl)) return decl.getName() ?? null;
  if (Node.isMethodDeclaration(decl)) {
    const cls = decl.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
    const className = cls?.getName();
    if (className) return `${className}.${decl.getName()}`;
    return decl.getName();
  }
  if (Node.isVariableDeclaration(decl)) return decl.getName();
  if (Node.isClassDeclaration(decl)) return decl.getName() ?? null;
  if (Node.isInterfaceDeclaration(decl)) return decl.getName() ?? null;
  return null;
}

function resolveCalleeIds(
  call: CallExpression,
  callerFilePath: string,
  index: SymbolIndex,
): { ids: string[]; tier: "EXTRACTED" | "INFERRED" | "AMBIGUOUS" } {
  const expr = call.getExpression();
  let resolvedSymbol = expr.getSymbol();
  if (!resolvedSymbol && Node.isPropertyAccessExpression(expr)) {
    resolvedSymbol = expr.getNameNode().getSymbol();
  }
  if (resolvedSymbol) {
    for (const decl of resolvedSymbol.getDeclarations()) {
      const declPath = normalizeRepoPath(decl.getSourceFile().getFilePath());
      if (declPath.includes("node_modules")) continue;
      const declName = getDeclName(decl);
      if (!declName) continue;
      const id = index.byFileAndName.get(declPath)?.get(declName);
      if (id) return { ids: [id], tier: "EXTRACTED" };
    }
  }

  const calleeName = getCalleeName(call);
  if (!calleeName) return { ids: [], tier: "INFERRED" };
  const localId = index.byFileAndName.get(callerFilePath)?.get(calleeName);
  if (localId) return { ids: [localId], tier: "INFERRED" };

  const globalIds = index.byNameGlobal.get(calleeName);
  if (!globalIds || globalIds.size === 0) return { ids: [], tier: "INFERRED" };

  const filtered = [...globalIds].filter((id) => index.functionsById.has(id));
  if (filtered.length === 0) return { ids: [], tier: "INFERRED" };
  if (filtered.length === 1) return { ids: filtered, tier: "INFERRED" };
  return { ids: filtered, tier: "AMBIGUOUS" };
}

function resolveCallsForSourceFile(
  source: SourceFile,
  callerFilePath: string,
  index: SymbolIndex,
  emitted: RelationEdge[],
): void {
  const perFile =
    index.byFileAndName.get(callerFilePath) ?? new Map<string, string>();
  source.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    const callerId = findEnclosingFunctionId(node, perFile);
    if (!callerId) return;
    const { ids, tier } = resolveCalleeIds(node, callerFilePath, index);
    for (const calleeId of ids) {
      if (calleeId === callerId) continue;
      if (!index.functionsById.has(calleeId)) continue;
      emitted.push({
        kind: "CALLS",
        fromId: callerId,
        toId: calleeId,
        confidence: CONFIDENCE_BY_TIER[tier],
        tier,
        callSiteLine: node.getStartLineNumber(),
      });
    }
  });
}

export function resolveCalls(
  project: Project,
  parseResult: ParseResult,
): RelationEdge[] {
  const index = buildIndex(parseResult.symbols);
  const calls: RelationEdge[] = [];

  for (const sym of parseResult.symbols) {
    if (sym.kind !== "file") continue;
    const source = project.getSourceFile(sym.path);
    if (!source) continue;
    resolveCallsForSourceFile(source, sym.path, index, calls);
  }

  return calls;
}
