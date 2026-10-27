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
  "skill",
]);

export function isSynthesisKind(kind: ProposedUpdateKind): boolean {
  return SYNTHESIS_KINDS.has(kind);
}

/**
 * Merge proposals: the kept memory (`memoryId`) always stays; the user may
 * untick the other sources before approving. `selectedIds` keeps proposal
 * order; approving needs at least one merged source.
 */
export function mergeSelection(
  proposal: Pick<ProposedUpdate, "memoryId" | "sourceMemoryIds">,
  unticked: readonly string[],
): { selectedIds: string[]; mergedCount: number; partial: boolean } {
  const selectedIds = proposal.sourceMemoryIds.filter(
    (id) => id === proposal.memoryId || !unticked.includes(id),
  );
  return {
    selectedIds,
    mergedCount: selectedIds.filter((id) => id !== proposal.memoryId).length,
    partial: selectedIds.length < proposal.sourceMemoryIds.length,
  };
}

export function toggleUnticked(
  unticked: readonly string[],
  id: string,
): string[] {
  return unticked.includes(id)
    ? unticked.filter((other) => other !== id)
    : [...unticked, id];
}

export {
  getProposalKindConfig,
  proposalAccentClass,
  proposalApproveToast,
  synthesisActionLabels,
  synthesisContentLabel,
  synthesisSourceListLabel,
} from "./_proposalKindConfig";
