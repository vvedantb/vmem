import type {
  EntryPoint,
  RelationEdge,
  SymbolNode,
  FunctionNode,
} from "./types";
const HEURISTIC_NAMES = new Set(["main", "handler", "start"]);

function entryName(fn: FunctionNode): string {
  const exportName = fn.parentClass ? `${fn.parentClass}.${fn.name}` : fn.name;
  return `${fn.filePath}::${exportName}`;
}

function detectFromSymbols(symbols: SymbolNode[]): EntryPoint[] {
  const entries: EntryPoint[] = [];
  const seenIds = new Set<string>();

  function addEntry(fn: FunctionNode, kind: EntryPoint["kind"]): void {
    entries.push({ functionId: fn.id, kind, name: entryName(fn) });
    seenIds.add(fn.id);
  }

  for (const s of symbols) {
    if (s.kind !== "function") continue;
    if (s.entryKind) addEntry(s, s.entryKind);
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
  symbols: SymbolNode[],
  calls: RelationEdge[],
): EntryPoint[] {
  const sourceEntries = detectFromSymbols(symbols);
  const seen = new Set(sourceEntries.map((e) => e.functionId));
  const noIncoming = detectExportedNoIncoming(symbols, calls, seen);
  return [...sourceEntries, ...noIncoming];
}
