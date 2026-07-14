import type { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";

export type CodebaseItem = FunctionReturnType<
  typeof api.codebases.listMy
>[number];

export type AddRepoModalRepo = FunctionReturnType<
  typeof api.codebases.listRepos
>[number];

export type CodebaseGraphPayload = FunctionReturnType<
  typeof api.codebaseSymbols.getGraph
>;

export type CodeNode = CodebaseGraphPayload["nodes"][number];
export type CodeEdge = CodebaseGraphPayload["edges"][number];
export type CodeNodeKind = CodeNode["kind"];

export type CodebaseSymbolContext = NonNullable<
  FunctionReturnType<typeof api.codebaseSymbols.getContext>
>;
