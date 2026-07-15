import { describe, expect, it } from "vitest";
import {
  parseRepository,
  type SourceFileBlob,
} from "../../engine/neo4j/codebase/parse";
import { resolveCalls } from "../../engine/neo4j/codebase/resolveCalls";
import { detectEntryPoints } from "../../engine/neo4j/codebase/entryPoints";
import { detectProcesses } from "../../engine/neo4j/codebase/processes";
import type {
  ClassNode,
  FileNode,
  FunctionNode,
  InterfaceNode,
  RelationEdge,
  SymbolNode,
} from "../../engine/neo4j/codebase/types";

const CODEBASE_ID = "fixture-cb";

function symId(path: string, symbolPath?: string): string {
  return symbolPath
    ? `${CODEBASE_ID}:${path}:${symbolPath}`
    : `${CODEBASE_ID}:${path}`;
}

function runPipeline(files: SourceFileBlob[]) {
  const { project, result } = parseRepository({
    codebaseId: CODEBASE_ID,
    files,
  });
  const calls = resolveCalls(project, result);
  const entryPoints = detectEntryPoints(result.symbols, calls);
  const processes = detectProcesses(CODEBASE_ID, entryPoints, calls);
  return { project, result, calls, entryPoints, processes };
}

function symbolsOfKind<K extends SymbolNode["kind"]>(
  symbols: SymbolNode[],
  kind: K,
): Extract<SymbolNode, { kind: K }>[] {
  return symbols.filter(
    (s): s is Extract<SymbolNode, { kind: K }> => s.kind === kind,
  );
}

function edgesOfKind(
  edges: RelationEdge[],
  kind: RelationEdge["kind"],
): RelationEdge[] {
  return edges.filter((e) => e.kind === kind);
}

const MULTI_FILE_FIXTURE: SourceFileBlob[] = [
  {
    path: "lib/types.ts",
    content: `export interface Identifiable {
  id: string;
}
`,
  },
  {
    path: "lib/base.ts",
    content: `export class Base {
  ping(): boolean {
    return true;
  }
}
`,
  },
  {
    path: "lib/entity.ts",
    content: `import type { Identifiable } from "./types";
import { Base } from "./base";

export class Entity extends Base implements Identifiable {
  id = "1";
  run(): void {
    this.ping();
  }
}
`,
  },
  {
    path: "src/utils.ts",
    content: `export function helper(): number {
  return 1;
}

export function duplicateName(): string {
  return "utils";
}
`,
  },
  {
    path: "other/dup.ts",
    content: `export function duplicateName(): string {
  return "other";
}
`,
  },
  {
    path: "src/app.ts",
    content: `import { helper } from "./utils";
import { Entity } from "../lib/entity";

export function main(): void {
  helper();
  start();
  onReady();
}

function start(): void {
  helper();
}

function onReady(): void {
  const e = new Entity();
  e.run();
}

export const listUsers = query({
  handler: async () => {
    return [];
  },
});

export const Route = createFileRoute("/home")({
  component: () => null,
});
`,
  },
];

describe("parseRepository", () => {
  it("emits file/function/class/interface symbols with stable ids", () => {
    const { result } = runPipeline(MULTI_FILE_FIXTURE);

    const files = symbolsOfKind(result.symbols, "file");
    const fns = symbolsOfKind(result.symbols, "function");
    const classes = symbolsOfKind(result.symbols, "class");
    const interfaces = symbolsOfKind(result.symbols, "interface");

    expect(files).toHaveLength(6);
    expect(fns.length).toBeGreaterThanOrEqual(8);
    expect(classes).toHaveLength(2);
    expect(interfaces).toHaveLength(1);

    const appFile = files.find((f) => f.path === "src/app.ts");
    expect(appFile).toMatchObject({
      id: symId("src/app.ts"),
      kind: "file",
      filename: "app.ts",
      directory: "src",
      extension: ".ts",
    } satisfies Partial<FileNode>);

    const mainFn = fns.find(
      (f) => f.filePath === "src/app.ts" && f.name === "main",
    );
    expect(mainFn).toMatchObject({
      id: symId("src/app.ts", "main"),
      isExported: true,
      isAsync: false,
      paramCount: 0,
    } satisfies Partial<FunctionNode>);

    const entityClass = classes.find((c) => c.name === "Entity");
    expect(entityClass).toMatchObject({
      id: symId("lib/entity.ts", "Entity"),
      extendsName: "Base",
      isExported: true,
    } satisfies Partial<ClassNode>);

    const identifiable = interfaces.find((i) => i.name === "Identifiable");
    expect(identifiable).toMatchObject({
      id: symId("lib/types.ts", "Identifiable"),
      isExported: true,
    } satisfies Partial<InterfaceNode>);

    const runMethod = fns.find(
      (f) => f.filePath === "lib/entity.ts" && f.name === "run",
    );
    expect(runMethod?.parentClass).toBe("Entity");
    expect(runMethod?.id).toBe(symId("lib/entity.ts", "Entity.run"));
  });

  it("emits CONTAINS and HAS_METHOD structural edges", () => {
    const { result } = runPipeline(MULTI_FILE_FIXTURE);

    const contains = edgesOfKind(result.structuralRelations, "CONTAINS");
    expect(
      contains.some(
        (e) =>
          e.fromId === symId("src/app.ts") &&
          e.toId === symId("src/app.ts", "main"),
      ),
    ).toBe(true);
    expect(
      contains.some(
        (e) =>
          e.fromId === symId("lib/entity.ts") &&
          e.toId === symId("lib/entity.ts", "Entity"),
      ),
    ).toBe(true);

    const hasMethod = edgesOfKind(result.structuralRelations, "HAS_METHOD");
    expect(
      hasMethod.some(
        (e) =>
          e.fromId === symId("lib/entity.ts", "Entity") &&
          e.toId === symId("lib/entity.ts", "Entity.run"),
      ),
    ).toBe(true);
  });
});

describe("resolveCalls", () => {
  it("resolves IMPORTS to target file ids with EXTRACTED tier", () => {
    const { result } = runPipeline(MULTI_FILE_FIXTURE);

    const imports = edgesOfKind(result.structuralRelations, "IMPORTS");
    expect(imports.length).toBeGreaterThan(0);

    const entityImports = imports.filter(
      (e) => e.fromId === symId("lib/entity.ts"),
    );
    expect(entityImports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toId: symId("lib/types.ts"),
          tier: "EXTRACTED",
          confidence: 1,
          importPath: "./types",
        }),
        expect.objectContaining({
          toId: symId("lib/base.ts"),
          tier: "EXTRACTED",
          importPath: "./base",
        }),
      ]),
    );

    for (const edge of imports) {
      expect(edge.toId).toMatch(/^fixture-cb:/);
      expect(edge.toId).not.toContain("./");
    }
  });

  it("resolves EXTENDS and IMPLEMENTS heritage edges", () => {
    const { result } = runPipeline(MULTI_FILE_FIXTURE);

    const extendsEdges = edgesOfKind(result.structuralRelations, "EXTENDS");
    expect(extendsEdges).toContainEqual(
      expect.objectContaining({
        fromId: symId("lib/entity.ts", "Entity"),
        toId: symId("lib/base.ts", "Base"),
        tier: "INFERRED",
      }),
    );

    const implementsEdges = edgesOfKind(
      result.structuralRelations,
      "IMPLEMENTS",
    );
    expect(implementsEdges).toContainEqual(
      expect.objectContaining({
        fromId: symId("lib/entity.ts", "Entity"),
        toId: symId("lib/types.ts", "Identifiable"),
        tier: "INFERRED",
      }),
    );
  });

  it("emits CALLS edges with EXTRACTED tier for imported cross-file callees", () => {
    const { calls } = runPipeline(MULTI_FILE_FIXTURE);

    const mainToHelper = calls.find(
      (c) =>
        c.fromId === symId("src/app.ts", "main") &&
        c.toId === symId("src/utils.ts", "helper"),
    );
    expect(mainToHelper).toMatchObject({
      kind: "CALLS",
      tier: "EXTRACTED",
      confidence: 1,
    });
  });

  it("emits CALLS edges with EXTRACTED tier for same-file callees", () => {
    const { calls } = runPipeline(MULTI_FILE_FIXTURE);

    const mainToStart = calls.find(
      (c) =>
        c.fromId === symId("src/app.ts", "main") &&
        c.toId === symId("src/app.ts", "start"),
    );
    expect(mainToStart).toMatchObject({
      kind: "CALLS",
      tier: "EXTRACTED",
      confidence: 1,
    });

    const mainToOnReady = calls.find(
      (c) =>
        c.fromId === symId("src/app.ts", "main") &&
        c.toId === symId("src/app.ts", "onReady"),
    );
    expect(mainToOnReady?.tier).toBe("EXTRACTED");
  });

  it("emits CALLS edges with EXTRACTED tier for method calls on local instances", () => {
    const { calls } = runPipeline(MULTI_FILE_FIXTURE);

    const onReadyToRun = calls.find(
      (c) =>
        c.fromId === symId("src/app.ts", "onReady") &&
        c.toId === symId("lib/entity.ts", "Entity.run"),
    );
    expect(onReadyToRun).toMatchObject({
      kind: "CALLS",
      tier: "EXTRACTED",
      confidence: 1,
    });
  });

  it("emits CALLS edges with EXTRACTED tier for import aliases", () => {
    const files: SourceFileBlob[] = [
      {
        path: "utils.ts",
        content: `export function helper(): number { return 1; }`,
      },
      {
        path: "alias.ts",
        content: `import { helper as h } from "./utils";

export function wrap() {
  h();
}
`,
      },
    ];

    const { calls } = runPipeline(files);
    expect(calls).toContainEqual(
      expect.objectContaining({
        fromId: symId("alias.ts", "wrap"),
        toId: symId("utils.ts", "helper"),
        tier: "EXTRACTED",
        confidence: 1,
      }),
    );
  });

  it("emits no CALLS edges for unresolved callees", () => {
    const files: SourceFileBlob[] = [
      {
        path: "missing.ts",
        content: `export function callMissing() {
  missingFn();
}
`,
      },
    ];

    const { calls } = runPipeline(files);
    expect(calls).toEqual([]);
  });

  it("emits EXTRACTED for the matching overload declaration line", () => {
    const files: SourceFileBlob[] = [
      {
        path: "overloads.ts",
        content: `export function format(value: string): string;
export function format(value: number): string;
export function format(value: string | number): string {
  return String(value);
}

export function useFormat() {
  format(1);
}
`,
      },
    ];

    const { calls, result } = runPipeline(files);
    const formatFns = result.symbols.filter(
      (s): s is FunctionNode =>
        s.kind === "function" &&
        s.filePath === "overloads.ts" &&
        s.name === "format",
    );
    // parse keeps one FunctionNode per name (implementation)
    expect(formatFns.length).toBeGreaterThanOrEqual(1);

    const edge = calls.find(
      (c) =>
        c.fromId === symId("overloads.ts", "useFormat") &&
        c.toId === symId("overloads.ts", "format"),
    );
    expect(edge?.tier).toBe("EXTRACTED");
  });
});

describe("detectEntryPoints", () => {
  it("detects convex query handlers", () => {
    const { entryPoints } = runPipeline(MULTI_FILE_FIXTURE);

    const convexQuery = entryPoints.find((e) => e.kind === "convex_query");
    expect(convexQuery).toMatchObject({
      functionId: symId("src/app.ts", "listUsers"),
      name: "src/app.ts::listUsers",
    });
  });

  it("detects heuristic main/handler/start and on* event handlers", () => {
    const { entryPoints } = runPipeline(MULTI_FILE_FIXTURE);

    expect(entryPoints).toContainEqual(
      expect.objectContaining({
        functionId: symId("src/app.ts", "main"),
        kind: "heuristic_main",
      }),
    );
    expect(entryPoints).toContainEqual(
      expect.objectContaining({
        functionId: symId("src/app.ts", "start"),
        kind: "heuristic_main",
      }),
    );
    expect(entryPoints).toContainEqual(
      expect.objectContaining({
        functionId: symId("src/app.ts", "onReady"),
        kind: "event_handler",
      }),
    );
  });

  it("detects exported functions with no incoming calls", () => {
    const { entryPoints } = runPipeline(MULTI_FILE_FIXTURE);

    const noIncoming = entryPoints.filter((e) => e.kind === "no_incoming");
    const helperEntry = noIncoming.find(
      (e) => e.functionId === symId("src/utils.ts", "helper"),
    );
    expect(helperEntry).toBeUndefined();

    const dupUtils = noIncoming.find(
      (e) => e.functionId === symId("src/utils.ts", "duplicateName"),
    );
    const dupOther = noIncoming.find(
      (e) => e.functionId === symId("other/dup.ts", "duplicateName"),
    );
    expect(dupUtils).toMatchObject({ kind: "no_incoming" });
    expect(dupOther).toMatchObject({ kind: "no_incoming" });
  });

  it("does not emit tanstack_route for createFileRoute assignments (dead branch)", () => {
    const { entryPoints } = runPipeline(MULTI_FILE_FIXTURE);

    const kinds = entryPoints.map((e): string => e.kind);
    expect(kinds).not.toContain("tanstack_route");
    expect(
      entryPoints.some((e) => e.functionId === symId("src/app.ts", "Route")),
    ).toBe(false);
  });
});

describe("detectProcesses", () => {
  it("builds reachability members from entry points on a simple call graph", () => {
    const { entryPoints, calls, processes } = runPipeline(MULTI_FILE_FIXTURE);

    expect(processes.length).toBe(entryPoints.length);

    const mainProcess = processes.find(
      (p) => p.entryPointId === symId("src/app.ts", "main"),
    );
    expect(mainProcess).toBeDefined();
    expect(mainProcess?.members).toEqual(
      expect.arrayContaining([
        symId("src/app.ts", "main"),
        symId("src/utils.ts", "helper"),
        symId("src/app.ts", "start"),
        symId("src/app.ts", "onReady"),
        symId("lib/entity.ts", "Entity.run"),
      ]),
    );

    const helperReachable = calls.some(
      (c) =>
        c.fromId === symId("src/app.ts", "main") &&
        c.toId === symId("src/utils.ts", "helper"),
    );
    expect(helperReachable).toBe(true);
    expect(mainProcess?.members).toContain(symId("src/utils.ts", "helper"));
  });

  it("assigns stable process ids from entry order", () => {
    const { processes } = runPipeline(MULTI_FILE_FIXTURE);

    expect(processes[0]?.id).toBe(`${CODEBASE_ID}:p0`);
    expect(processes[1]?.id).toBe(`${CODEBASE_ID}:p1`);
  });
});

describe("ambiguous call resolution", () => {
  it("emits AMBIGUOUS tier when an unresolved name matches multiple functions", () => {
    const files: SourceFileBlob[] = [
      {
        path: "a/one.ts",
        content: `export function duplicateName() { return "one"; }`,
      },
      {
        path: "b/two.ts",
        content: `export function duplicateName() { return "two"; }`,
      },
      {
        path: "c/caller.ts",
        content: `export function invoke() {
  duplicateName();
}
`,
      },
    ];

    const { calls } = runPipeline(files);
    const ambiguous = calls.filter((c) => c.tier === "AMBIGUOUS");
    expect(ambiguous.length).toBe(2);
    expect(ambiguous[0]?.confidence).toBe(0.4);
    expect(ambiguous.map((c) => c.toId).sort()).toEqual(
      [
        symId("a/one.ts", "duplicateName"),
        symId("b/two.ts", "duplicateName"),
      ].sort(),
    );
  });

  it("emits EXTRACTED (not AMBIGUOUS) when the import resolves uniquely", () => {
    const files: SourceFileBlob[] = [
      {
        path: "a/one.ts",
        content: `export function duplicateName() { return "one"; }`,
      },
      {
        path: "b/two.ts",
        content: `export function duplicateName() { return "two"; }`,
      },
      {
        path: "c/caller.ts",
        content: `import { duplicateName } from "../a/one";

export function invoke() {
  duplicateName();
}
`,
      },
    ];

    const { calls } = runPipeline(files);
    expect(calls.filter((c) => c.tier === "AMBIGUOUS")).toEqual([]);
    expect(calls).toContainEqual(
      expect.objectContaining({
        fromId: symId("c/caller.ts", "invoke"),
        toId: symId("a/one.ts", "duplicateName"),
        tier: "EXTRACTED",
        confidence: 1,
      }),
    );
  });
});
