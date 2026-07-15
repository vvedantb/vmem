import type {
  EntryPoint,
  RelationEdge,
  SymbolNode,
  FunctionNode,
} from "./types";
import { convexEntryKind } from "./convexBuilders";
import { normalizeRepoPath } from "./parse";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";

const HEURISTIC_NAMES = new Set(["main", "handler", "start"]);

function entryName(fn: FunctionNode): string {
  const exportName = fn.parentClass ? `${fn.parentClass}.${fn.name}` : fn.name;
  return `${fn.filePath}::${exportName}`;
}

function detectFromSource(
  project: Project,
  symbols: SymbolNode[],
): EntryPoint[] {
  const entries: EntryPoint[] = [];
  const seenIds = new Set<string>();
  const fnByPathName = new Map<string, FunctionNode>();
  for (const s of symbols) {
    if (s.kind !== "function") continue;
    fnByPathName.set(`${s.filePath}::${s.name}`, s);
  }

  function addEntry(fn: FunctionNode, kind: EntryPoint["kind"]): void {
    entries.push({ functionId: fn.id, kind, name: entryName(fn) });
    seenIds.add(fn.id);
  }

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = normalizeRepoPath(sourceFile.getFilePath());
    for (const v of sourceFile.getVariableDeclarations()) {
      const init = v.getInitializer();
      if (!init || !Node.isCallExpression(init)) continue;
      const calleeText = init.getExpression().getText();
      const fnNode = fnByPathName.get(`${filePath}::${v.getName()}`);
      if (!fnNode) continue;

      const convexKind = convexEntryKind(calleeText);
      if (convexKind) addEntry(fnNode, convexKind);
    }
  }

  for (const s of symbols) {
    if (s.kind !== "function") continue;
    if (seenIds.has(s.id) || s.parentClass) continue;
    if (HEURISTIC_NAMES.has(s.name)) {
      addEntry(s, "heuristic_main");
    } else if (s.name.startsWith("on")) {
      addEntry(s, "event_handler");
    }
  }

  return entries;
}

function detectExportedNoIncoming(
  symbols: SymbolNode[],
  calls: RelationEdge[],
  alreadySeen: Set<string>,
): EntryPoint[] {
  const hasIncoming = new Set(calls.map((c) => c.toId));
  const out: EntryPoint[] = [];
  for (const s of symbols) {
    if (s.kind !== "function") continue;
    if (alreadySeen.has(s.id) || !s.isExported || hasIncoming.has(s.id)) {
      continue;
    }
    out.push({
      functionId: s.id,
      kind: "no_incoming",
      name: entryName(s),
    });
  }
  return out;
}

export function detectEntryPoints(
  project: Project,
  symbols: SymbolNode[],
  calls: RelationEdge[],
): EntryPoint[] {
  const sourceEntries = detectFromSource(project, symbols);
  const seen = new Set(sourceEntries.map((e) => e.functionId));
  const noIncoming = detectExportedNoIncoming(symbols, calls, seen);
  return [...sourceEntries, ...noIncoming];
}
