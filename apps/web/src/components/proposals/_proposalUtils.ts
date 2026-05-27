import type { ProposedUpdateKind } from "@/hooks/useProposals";

export function formatProposalRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${String(diffMin)}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${String(diffHr)}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${String(diffDay)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function proposalAccentClass(kind: ProposedUpdateKind): string {
  switch (kind) {
    case "delete":
    case "contradiction":
      return "bg-danger";
    case "update":
      return "bg-accent";
    case "insight":
      return "bg-surface-tertiary";
    case "connection":
      return "bg-success";
    case "anomaly":
      return "bg-warning";
  }
}
