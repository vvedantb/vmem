import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";

export type ProposedUpdate = FunctionReturnType<
  typeof api.proposedUpdateApi.listProposedUpdates
>[number];

export type ProposedUpdateKind = ProposedUpdate["kind"];

export type SourceMemorySnapshot =
  ProposedUpdate["sourceMemorySnapshots"][number];

export function proposalAccentClass(kind: ProposedUpdateKind): string {
  switch (kind) {
    case "delete":
    case "contradiction":
      return "bg-danger";
    case "update":
    case "merge":
      return "bg-accent";
    case "insight":
      return "bg-surface-tertiary";
    case "connection":
      return "bg-success";
    case "anomaly":
      return "bg-warning";
  }
}
