import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";

export type ProposedUpdate = FunctionReturnType<
  typeof api.proposedUpdateApi.listProposedUpdates
>[number];

export type ProposedUpdateKind = ProposedUpdate["kind"];

export type SourceMemorySnapshot =
  ProposedUpdate["sourceMemorySnapshots"][number];

const SYNTHESIS_KINDS = new Set<ProposedUpdateKind>([
  "insight",
  "connection",
  "contradiction",
  "anomaly",
  "merge",
]);

export function isSynthesisKind(kind: ProposedUpdateKind): boolean {
  return SYNTHESIS_KINDS.has(kind);
}

export {
  getProposalKindConfig,
  proposalAccentClass,
  proposalApproveToast,
  synthesisActionLabels,
  synthesisContentLabel,
  synthesisSourceListLabel,
} from "./_proposalKindConfig";
