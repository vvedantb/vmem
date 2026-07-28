export type ConfidenceTier = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export const CONFIDENCE_BY_TIER: Record<ConfidenceTier, number> = {
  EXTRACTED: 1.0,
  INFERRED: 0.7,
  AMBIGUOUS: 0.4,
};

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
  parentClass?: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  isAsync: boolean;
  isTest: boolean;
  paramCount: number;
  entryKind?: EntryPoint["kind"];
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
  // heritage name before parse resolves the target symbol
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

export interface RelationEdge {
  kind:
    | "IMPORTS"
    | "CONTAINS"
    | "HAS_METHOD"
    | "CALLS"
    | "EXTENDS"
    | "IMPLEMENTS";
  fromId: string;
  toId: string;
  // confidence tier applies only on imports, calls, extends and implements
  confidence?: number;
  tier?: ConfidenceTier;
  // imports carry the source text path from the statement
  importPath?: string;
  // calls record the call-site line for navigation
  callSiteLine?: number;
}

export interface EntryPoint {
  functionId: string;
  kind:
    | "convex_query"
    | "convex_mutation"
    | "convex_action"
    | "convex_internal"
    | "convex_http"
    | "heuristic_main"
    | "event_handler"
    | "no_incoming";
  name: string;
}

export interface ProcessNode {
  id: string;
  name: string;
  entryPointId: string;
  entryKind: EntryPoint["kind"];
  // function ids reachable from the entry within depth eight
  members: string[];
}

export interface ParseResult {
  symbols: SymbolNode[];
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
