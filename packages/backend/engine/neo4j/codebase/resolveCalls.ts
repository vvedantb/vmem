/**
 * Resolves CALL edges using ts-morph's TypeChecker, plus patches the
 * IMPORTS / EXTENDS / IMPLEMENTS placeholders that `parse.ts` emitted.
 *
 * Two-pass design:
 *   1. Build a name→symbol-id map keyed by file. Used as a fallback when
 *      the type checker can't resolve a callee (untyped JS, missing
 *      decls, etc.).
 *   2. Walk every CallExpression in the loaded source files and emit a
 *      `CALLS` edge.
 *      - Type checker resolved + declaration in our symbol set →
 *        `EXTRACTED` / 1.0
 *      - Type checker miss but exact same-file or imported-name match →
 *        `INFERRED` / 0.7
 *      - Multiple candidates in different files → `AMBIGUOUS` / 0.4 (one
 *        edge per candidate)
 */

import {
  SyntaxKind,
  type Node,
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
  type ClassNode,
  type InterfaceNode,
} from "./types";

interface SymbolIndex {
  /** All symbol nodes by id. */
  byId: Map<string, SymbolNode>;
  /** Functions only — quick lookup for CALLS resolution. */
  functionsById: Map<string, FunctionNode>;
  /** Classes only — for EXTENDS/IMPLEMENTS resolution. */
  classesById: Map<string, ClassNode>;
  /** Interfaces — for IMPLEMENTS resolution. */
  interfacesById: Map<string, InterfaceNode>;
  /** filePath → name → symbol id (functions/classes/interfaces only). */
  byFileAndName: Map<string, Map<string, string>>;
  /** name → set<symbolId> (across files). For ambiguous fallback. */
  byNameGlobal: Map<string, Set<string>>;
}

function buildIndex(symbols: SymbolNode[]): SymbolIndex {
  const byId = new Map<string, SymbolNode>();
  const functionsById = new Map<string, FunctionNode>();
  const classesById = new Map<string, ClassNode>();
  const interfacesById = new Map<string, InterfaceNode>();
  const byFileAndName = new Map<string, Map<string, string>>();
  const byNameGlobal = new Map<string, Set<string>>();

  for (const sym of symbols) {
    byId.set(sym.id, sym);
    if (sym.kind === "function") functionsById.set(sym.id, sym);
    else if (sym.kind === "class") classesById.set(sym.id, sym);
    else if (sym.kind === "interface") interfacesById.set(sym.id, sym);

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

  return {
    byId,
    functionsById,
    classesById,
    interfacesById,
    byFileAndName,
    byNameGlobal,
  };
}

/** Look up a possibly-undefined name in the per-file symbol map. */
function lookupByName(
  perFile: Map<string, string>,
  name: string | undefined,
): string | null {
  if (!name) return null;
  return perFile.get(name) ?? null;
}

/** Identify the function that contains a given call expression. */
function findEnclosingFunctionId(
  call: CallExpression,
  perFile: Map<string, string>,
): string | null {
  let ancestor: Node | undefined = call.getParent();
  while (ancestor) {
    const k = ancestor.getKind();
    if (k === SyntaxKind.FunctionDeclaration) {
      const fd = ancestor.asKind(SyntaxKind.FunctionDeclaration);
      const id = lookupByName(perFile, fd?.getName());
      if (id) return id;
    } else if (k === SyntaxKind.MethodDeclaration) {
      const md = ancestor.asKind(SyntaxKind.MethodDeclaration);
      const methodName = md?.getName();
      // Walk further up to the class to disambiguate Class.method.
      const cls = md?.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
      const className = cls?.getName();
      const id =
        methodName && className
          ? lookupByName(perFile, `${className}.${methodName}`)
          : null;
      if (id) return id;
    } else if (k === SyntaxKind.VariableDeclaration) {
      const vd = ancestor.asKind(SyntaxKind.VariableDeclaration);
      const id = lookupByName(perFile, vd?.getName());
      if (id) return id;
    }
    // ArrowFunction / FunctionExpression (anonymous nested fn) and any
    // other node kind: keep walking up.
    ancestor = ancestor.getParent();
  }
  return null;
}

function getCalleeName(call: CallExpression): string {
  const expr = call.getExpression();
  if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
    const pae = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    return pae.getName();
  }
  return expr.getText();
}

/** Try the type checker first; fall back to local name match; then global. */
function resolveCalleeIds(
  call: CallExpression,
  callerFilePath: string,
  index: SymbolIndex,
): { ids: string[]; tier: "EXTRACTED" | "INFERRED" | "AMBIGUOUS" } {
  const expr = call.getExpression();
  // Symbol resolution via type checker.
  let resolvedSymbol = expr.getSymbol();
  if (
    !resolvedSymbol &&
    expr.getKind() === SyntaxKind.PropertyAccessExpression
  ) {
    resolvedSymbol = expr
      .asKindOrThrow(SyntaxKind.PropertyAccessExpression)
      .getNameNode()
      .getSymbol();
  }
  if (resolvedSymbol) {
    for (const decl of resolvedSymbol.getDeclarations()) {
      const declFile = decl.getSourceFile();
      const declPath = declFile.getFilePath().toString();
      // Skip node_modules / lib.d.ts.
      if (declPath.includes("node_modules")) continue;
      const declName = getDeclName(decl);
      if (!declName) continue;
      const perFile = index.byFileAndName.get(declPath);
      const id = perFile?.get(declName);
      if (id) return { ids: [id], tier: "EXTRACTED" };
    }
  }

  // Fallback: name match in same file.
  const calleeName = getCalleeName(call);
  if (!calleeName) return { ids: [], tier: "INFERRED" };
  const perFile = index.byFileAndName.get(callerFilePath);
  const localId = perFile?.get(calleeName);
  if (localId) return { ids: [localId], tier: "INFERRED" };

  // Final fallback: global name match.
  const globalIds = index.byNameGlobal.get(calleeName);
  if (!globalIds || globalIds.size === 0) {
    return { ids: [], tier: "INFERRED" };
  }
  const filtered: string[] = [];
  for (const candidateId of globalIds) {
    const sym = index.byId.get(candidateId);
    if (sym && sym.kind === "function") filtered.push(candidateId);
  }
  if (filtered.length === 0) return { ids: [], tier: "INFERRED" };
  if (filtered.length === 1) return { ids: filtered, tier: "INFERRED" };
  return { ids: filtered, tier: "AMBIGUOUS" };
}

function getDeclName(decl: Node): string | null {
  const k = decl.getKind();
  if (k === SyntaxKind.FunctionDeclaration) {
    return decl.asKind(SyntaxKind.FunctionDeclaration)?.getName() ?? null;
  }
  if (k === SyntaxKind.MethodDeclaration) {
    const md = decl.asKind(SyntaxKind.MethodDeclaration);
    const cls = md?.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
    if (md && cls?.getName()) {
      return `${cls.getName()}.${md.getName()}`;
    }
    return md?.getName() ?? null;
  }
  if (k === SyntaxKind.VariableDeclaration) {
    return decl.asKind(SyntaxKind.VariableDeclaration)?.getName() ?? null;
  }
  if (k === SyntaxKind.ClassDeclaration) {
    return decl.asKind(SyntaxKind.ClassDeclaration)?.getName() ?? null;
  }
  if (k === SyntaxKind.InterfaceDeclaration) {
    return decl.asKind(SyntaxKind.InterfaceDeclaration)?.getName() ?? null;
  }
  return null;
}

/** Patch IMPORTS edges: textual modulePath → resolved file id. */
function patchImports(
  project: Project,
  loadedPaths: Set<string>,
  codebaseId: string,
  edges: RelationEdge[],
  index: SymbolIndex,
): void {
  for (const edge of edges) {
    if (edge.kind !== "IMPORTS") continue;
    const fromFile = index.byId.get(edge.fromId);
    if (!fromFile || fromFile.kind !== "file") continue;
    const importPath = edge.toId;
    const sourceFile = project.getSourceFile(fromFile.path);
    if (!sourceFile) continue;
    // ts-morph resolves relative + path-aliased imports for us.
    const resolved = sourceFile
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === importPath)
      ?.getModuleSpecifierSourceFile();
    if (!resolved) {
      // Couldn't resolve — leave as-is so caller can drop it later.
      edge.toId = "";
      continue;
    }
    const targetPath = resolved.getFilePath().toString();
    if (!loadedPaths.has(targetPath)) {
      edge.toId = "";
      continue;
    }
    edge.toId = `${codebaseId}:${targetPath}`;
    edge.confidence = CONFIDENCE_BY_TIER.EXTRACTED;
    edge.tier = "EXTRACTED";
  }
}

/** Patch EXTENDS/IMPLEMENTS edges: textual name → resolved class/interface id. */
function patchHeritage(edges: RelationEdge[], index: SymbolIndex): void {
  for (const edge of edges) {
    if (edge.kind !== "EXTENDS" && edge.kind !== "IMPLEMENTS") continue;
    const fromSym = index.byId.get(edge.fromId);
    if (!fromSym || fromSym.kind !== "class") continue;
    const targetName = edge.toId;
    // Try same file first.
    const perFile = index.byFileAndName.get(fromSym.filePath);
    const localId = perFile?.get(targetName);
    if (localId) {
      const target = index.byId.get(localId);
      if (
        target &&
        ((edge.kind === "EXTENDS" && target.kind === "class") ||
          (edge.kind === "IMPLEMENTS" && target.kind === "interface"))
      ) {
        edge.toId = localId;
        edge.confidence = CONFIDENCE_BY_TIER.INFERRED;
        edge.tier = "INFERRED";
        continue;
      }
    }
    // Global by name.
    const candidates = index.byNameGlobal.get(targetName);
    if (!candidates || candidates.size === 0) {
      edge.toId = "";
      continue;
    }
    const filtered: string[] = [];
    for (const cid of candidates) {
      const c = index.byId.get(cid);
      if (
        c &&
        ((edge.kind === "EXTENDS" && c.kind === "class") ||
          (edge.kind === "IMPLEMENTS" && c.kind === "interface"))
      ) {
        filtered.push(cid);
      }
    }
    if (filtered.length === 1) {
      const single = filtered.at(0);
      if (single !== undefined) {
        edge.toId = single;
        edge.confidence = CONFIDENCE_BY_TIER.INFERRED;
        edge.tier = "INFERRED";
      }
    } else if (filtered.length === 0) {
      edge.toId = "";
    } else {
      // Pick first; mark ambiguous. Phase 1 won't render tiers anyway.
      const first = filtered.at(0);
      if (first !== undefined) {
        edge.toId = first;
        edge.confidence = CONFIDENCE_BY_TIER.AMBIGUOUS;
        edge.tier = "AMBIGUOUS";
      }
    }
  }
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
    if (node.getKind() !== SyntaxKind.CallExpression) return;
    const call = node.asKindOrThrow(SyntaxKind.CallExpression);
    const callerId = findEnclosingFunctionId(call, perFile);
    if (!callerId) return; // top-level call in module init — skip in Phase 1
    const { ids, tier } = resolveCalleeIds(call, callerFilePath, index);
    for (const calleeId of ids) {
      if (calleeId === callerId) continue; // skip recursive self-edges
      if (!index.functionsById.has(calleeId)) continue; // only fn→fn edges
      emitted.push({
        kind: "CALLS",
        fromId: callerId,
        toId: calleeId,
        confidence: CONFIDENCE_BY_TIER[tier],
        tier,
        callSiteLine: call.getStartLineNumber(),
      });
    }
  });
}

/**
 * Run the resolver. Mutates `parseResult.structuralRelations` in place to
 * patch placeholder edges; returns the new CALLS edges separately so the
 * writer can chunk them differently if needed.
 */
export function resolveCalls(
  project: Project,
  parseResult: ParseResult,
  codebaseId: string,
): { calls: RelationEdge[] } {
  const index = buildIndex(parseResult.symbols);
  const calls: RelationEdge[] = [];

  const loadedPaths = new Set(
    parseResult.symbols
      .filter(
        (s): s is Extract<SymbolNode, { kind: "file" }> => s.kind === "file",
      )
      .map((s) => s.path),
  );

  patchImports(
    project,
    loadedPaths,
    codebaseId,
    parseResult.structuralRelations,
    index,
  );
  patchHeritage(parseResult.structuralRelations, index);

  for (const path of loadedPaths) {
    const source = project.getSourceFile(path);
    if (!source) continue;
    resolveCallsForSourceFile(source, path, index, calls);
  }

  // Drop placeholder edges that couldn't resolve.
  parseResult.structuralRelations = parseResult.structuralRelations.filter(
    (e) => e.toId !== "",
  );

  return { calls };
}
