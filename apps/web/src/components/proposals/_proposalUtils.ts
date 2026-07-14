import type { ProposedUpdateKind } from "@/hooks/useProposals";

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
