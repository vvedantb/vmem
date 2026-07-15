import {
  Node,
  type Project,
  type CallExpression,
  type Symbol as TsMorphSymbol,
} from "ts-morph";
import {
  CONFIDENCE_BY_TIER,
  type ConfidenceTier,
  type ParseResult,
  type RelationEdge,
  type FunctionNode,
} from "./types";
import { normalizeRepoPath } from "./parse";

type CallTier = Extract<ConfidenceTier, "EXTRACTED" | "INFERRED" | "AMBIGUOUS">;

interface FunctionIndex {
  byId: Map<string, FunctionNode>;
  byFileLine: Map<string, string>;
  byFileName: Map<string, string>;
  byName: Map<string, Set<string>>;
}

function buildIndex(symbols: ParseResult["symbols"]): FunctionIndex {
  const byId = new Map<string, FunctionNode>();
  const byFileLine = new Map<string, string>();
  const byFileName = new Map<string, string>();
  const byName = new Map<string, Set<string>>();

  for (const sym of symbols) {
    if (sym.kind !== "function") continue;
    byId.set(sym.id, sym);
    byFileLine.set(`${sym.filePath}:${sym.startLine}`, sym.id);
    byFileName.set(`${sym.filePath}\0${sym.name}`, sym.id);
    const ids = byName.get(sym.name) ?? new Set<string>();
    ids.add(sym.id);
    byName.set(sym.name, ids);
  }

  return { byId, byFileLine, byFileName, byName };
}

function idForDeclaration(
  decl: Node,
  index: FunctionIndex,
): string | undefined {
  const path = normalizeRepoPath(decl.getSourceFile().getFilePath());
  if (path.includes("node_modules")) return undefined;
  return index.byFileLine.get(`${path}:${decl.getStartLineNumber()}`);
}

function findEnclosingFunctionId(
  call: CallExpression,
  index: FunctionIndex,
): string | null {
  for (const ancestor of call.getAncestors()) {
    if (
      !Node.isFunctionDeclaration(ancestor) &&
      !Node.isMethodDeclaration(ancestor) &&
      !Node.isVariableDeclaration(ancestor)
    ) {
      continue;
    }
    const id = idForDeclaration(ancestor, index);
    if (id) return id;
  }
  return null;
}

function calleeSymbol(call: CallExpression): TsMorphSymbol | undefined {
  const expr = call.getExpression();
  if (Node.isPropertyAccessExpression(expr)) {
    return expr.getNameNode().getSymbol() ?? expr.getSymbol();
  }
  return expr.getSymbol();
}

function resolveCalleeIds(
  call: CallExpression,
  callerFilePath: string,
  index: FunctionIndex,
): { ids: string[]; tier: CallTier } {
  const symbol = calleeSymbol(call);
  if (symbol) {
    const resolved = symbol.getAliasedSymbol() ?? symbol;
    for (const decl of resolved.getDeclarations()) {
      const id = idForDeclaration(decl, index);
      if (id) return { ids: [id], tier: "EXTRACTED" };
    }
  }

  const expr = call.getExpression();
  const calleeName = Node.isPropertyAccessExpression(expr)
    ? expr.getName()
    : expr.getText();
  if (!calleeName) return { ids: [], tier: "INFERRED" };

  const localId = index.byFileName.get(`${callerFilePath}\0${calleeName}`);
  if (localId) return { ids: [localId], tier: "INFERRED" };

  const globalIds = [...(index.byName.get(calleeName) ?? [])];
  if (globalIds.length === 0) return { ids: [], tier: "INFERRED" };
  if (globalIds.length === 1) return { ids: globalIds, tier: "INFERRED" };
  return { ids: globalIds, tier: "AMBIGUOUS" };
}

// AI-generated (Claude), prompt: "resolve call expressions to callee symbol ids with confidence tiers for local inferred and ambiguous matches"
// Modified by me: tightened enclosing function lookup and ambiguous multi match behavior
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

    source.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const callerId = findEnclosingFunctionId(node, index);
      if (!callerId) return;
      const { ids, tier } = resolveCalleeIds(node, sym.path, index);
      for (const calleeId of ids) {
        if (calleeId === callerId || !index.byId.has(calleeId)) continue;
        calls.push({
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

  return calls;
}
