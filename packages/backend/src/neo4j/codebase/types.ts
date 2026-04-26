/**
 * Shared types for the Phase 1 codebase parser pipeline.
 *
 * Stable IDs use **qualified-name format**: `<codebaseId>:<relPath>:<symbolPath>`.
 * Methods append `Class.method`. Files: `<codebaseId>:<path>`. Processes:
 * `<codebaseId>:p<n>`. Idempotent re-syncs (MERGE matches the same node) and
 * debuggable in raw Cypher.
 *
 * Confidence policy:
 *   - AST-resolved by ts-morph type checker → 1.0 / `EXTRACTED`
 *   - Same-file name match (no resolved symbol) → 0.7 / `INFERRED`
 *   - Multiple candidates → 0.4 / `AMBIGUOUS` (one edge per candidate)
 * Structural edges (`CONTAINS`, `HAS_METHOD`, `INCLUDES`, `STARTS_PROCESS`)
 * carry no confidence.
 */

export type ConfidenceTier = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export const CONFIDENCE_BY_TIER: Record<ConfidenceTier, number> = {
  EXTRACTED: 1.0,
  INFERRED: 0.7,
  AMBIGUOUS: 0.4,
};

export type SymbolKind = "file" | "function" | "class" | "interface";

export interface FileNode {
  kind: "file";
  id: string;
  path: string;
  directory: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  contentHash: string;
}

export interface FunctionNode {
  kind: "function";
  id: string;
  filePath: string;
  name: string;
  qualifiedName: string;
  /** Set when this is a method of a class. */
  parentClass?: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  isAsync: boolean;
  isTest: boolean;
  paramCount: number;
}

export interface ClassNode {
  kind: "class";
  id: string;
  filePath: string;
  name: string;
  qualifiedName: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  isAbstract: boolean;
  /** Name only (resolution happens in resolveCalls/structural-edges step). */
  extendsName?: string;
}

export interface InterfaceNode {
  kind: "interface";
  id: string;
  filePath: string;
  name: string;
  qualifiedName: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
}

export type SymbolNode = FileNode | FunctionNode | ClassNode | InterfaceNode;

export type RelationKind =
  | "IMPORTS"
  | "CONTAINS"
  | "HAS_METHOD"
  | "CALLS"
  | "EXTENDS"
  | "IMPLEMENTS";

export interface RelationEdge {
  kind: RelationKind;
  fromId: string;
  toId: string;
  /** Only present on edges that carry confidence (IMPORTS / CALLS / EXTENDS / IMPLEMENTS). */
  confidence?: number;
  tier?: ConfidenceTier;
  /** IMPORTS-specific: source-text path string from the import statement. */
  importPath?: string;
  /** CALLS-specific: line of the call site. */
  callSiteLine?: number;
}

/** Detected entry point — a function that starts an end-to-end Process. */
export interface EntryPoint {
  /** Function symbol id. */
  functionId: string;
  /** What pattern matched. */
  kind:
    | "convex_query"
    | "convex_mutation"
    | "convex_action"
    | "convex_internal"
    | "convex_http"
    | "tanstack_route"
    | "heuristic_main"
    | "event_handler"
    | "no_incoming";
  /** Display name, e.g. "convex/codebases.ts::syncCodebase". */
  name: string;
}

export interface ProcessNode {
  id: string;
  name: string;
  entryPointId: string;
  entryKind: EntryPoint["kind"];
  /** Function ids reachable from the entry point (depth ≤ 8). */
  members: string[];
}

export interface ParseResult {
  /** All file/function/class/interface nodes in dependency order. */
  symbols: SymbolNode[];
  /** Structural edges from parsing alone (CONTAINS / HAS_METHOD / EXTENDS / IMPLEMENTS / IMPORTS). */
  structuralRelations: RelationEdge[];
}

export interface ParseStats {
  fileCount: number;
  functionCount: number;
  classCount: number;
  interfaceCount: number;
  callEdgeCount: number;
  processCount: number;
  importEdgeCount: number;
}

export const PARSER_VERSION = "1.0.0";
