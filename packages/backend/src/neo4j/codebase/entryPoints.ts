/**
 * Entry-point detection. Phase 1 supports four shapes:
 *   - Convex builders: `query`/`mutation`/`action`/`internalQuery`/
 *     `internalMutation`/`internalAction`/`httpAction`/`authQuery`/
 *     `authMutation`/`authAction`/`authInternalAction`.
 *   - TanStack Router: `createFileRoute(...)({ component: ... })`.
 *   - Heuristic names: top-level `main`, `handler`, `start`, `on*`.
 *   - Any exported function with zero incoming `CALLS` edges.
 *
 * Returns one `EntryPoint` per detected function. The same function can
 * be matched by multiple patterns; the first match wins (priority order
 * mirrors the list above).
 */

import {
  type EntryPoint,
  type RelationEdge,
  type SymbolNode,
  type FunctionNode,
} from "./types";
import { Project, SyntaxKind } from "ts-morph";

const CONVEX_KIND_BY_BUILDER: Record<string, EntryPoint["kind"]> = {
  query: "convex_query",
  mutation: "convex_mutation",
  action: "convex_action",
  internalQuery: "convex_internal",
  internalMutation: "convex_internal",
  internalAction: "convex_internal",
  authInternalAction: "convex_internal",
  httpAction: "convex_http",
  authQuery: "convex_query",
  authMutation: "convex_mutation",
  authAction: "convex_action",
};

const HEURISTIC_NAMES = new Set(["main", "handler", "start"]);

function entryName(fn: FunctionNode): string {
  const exportName = fn.parentClass ? `${fn.parentClass}.${fn.name}` : fn.name;
  return `${fn.filePath}::${exportName}`;
}

/** Detect Convex builder + TanStack route + heuristic-name entries by walking source. */
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

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath().toString();
    for (const v of sourceFile.getVariableDeclarations()) {
      const init = v.getInitializer();
      if (!init || init.getKind() !== SyntaxKind.CallExpression) continue;
      const call = init.asKindOrThrow(SyntaxKind.CallExpression);
      const calleeText = call.getExpression().getText();
      const fnNode = fnByPathName.get(`${filePath}::${v.getName()}`);
      if (!fnNode) continue;

      // Convex builders.
      const convexKind = CONVEX_KIND_BY_BUILDER[calleeText];
      if (convexKind) {
        entries.push({
          functionId: fnNode.id,
          kind: convexKind,
          name: entryName(fnNode),
        });
        seenIds.add(fnNode.id);
        continue;
      }

      // TanStack `createFileRoute("...")({...})`.
      // The outer call is an immediately-invoked builder; the inner CE
      // has callee `createFileRoute` (or `createRootRoute`).
      if (calleeText.startsWith("createFileRoute")) {
        entries.push({
          functionId: fnNode.id,
          kind: "tanstack_route",
          name: entryName(fnNode),
        });
        seenIds.add(fnNode.id);
        continue;
      }
    }
  }

  // Heuristic names — top-level functions only (no parentClass).
  for (const s of symbols) {
    if (s.kind !== "function") continue;
    if (seenIds.has(s.id)) continue;
    if (s.parentClass) continue;
    if (HEURISTIC_NAMES.has(s.name) || s.name.startsWith("on")) {
      entries.push({
        functionId: s.id,
        kind: HEURISTIC_NAMES.has(s.name) ? "heuristic_main" : "event_handler",
        name: entryName(s),
      });
      seenIds.add(s.id);
    }
  }

  return entries;
}

/** Exported functions with zero incoming CALLS edges become "no_incoming" entries. */
function detectExportedNoIncoming(
  symbols: SymbolNode[],
  calls: RelationEdge[],
  alreadySeen: Set<string>,
): EntryPoint[] {
  const incoming = new Map<string, number>();
  for (const c of calls) {
    incoming.set(c.toId, (incoming.get(c.toId) ?? 0) + 1);
  }
  const out: EntryPoint[] = [];
  for (const s of symbols) {
    if (s.kind !== "function") continue;
    if (alreadySeen.has(s.id)) continue;
    if (!s.isExported) continue;
    if ((incoming.get(s.id) ?? 0) > 0) continue;
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
