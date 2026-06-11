"use client";

import { useCallback, useMemo } from "react";
import { useConvexAuth, useAction } from "convex/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@vmem/backend";

/**
 * Shape returned by `api.proposedUpdateApi.listProposedUpdates`. Mirror of
 * the server-side `ProposedUpdateNode` interface — duplicated here only
 * because Convex `authAction` return types aren't autoderivable from
 * `FunctionReturnType` cleanly today, and we want a strict client type.
 *
 * - `update`/`delete`: V2 fact-extraction proposals (rewrite or delete an
 *   existing memory on approve).
 * - `insight`/`connection`/`anomaly`: Dream Mode V2 synthesis proposals
 *   (materialize a NEW memory with `:DERIVED_FROM` edges to sources on
 *   approve).
 * - `contradiction`: Dream Mode flagged two memories that disagree.
 *   Approving with a winner keeps that memory and suppresses the rest;
 *   approving without one just dismisses the flag.
 * - `merge`: Dream Mode found near-duplicate fragments. Approving creates
 *   the consolidated memory and supersedes the sources.
 */
export type ProposedUpdateKind =
  | "update"
  | "delete"
  | "insight"
  | "connection"
  | "contradiction"
  | "anomaly"
  | "merge";

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

export interface ProposedUpdate {
  id: string;
  memoryId: string;
  proposedContent: string;
  proposedTitle: string | null;
  reason: string;
  kind: ProposedUpdateKind;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  sourceMemoryIds: string[];
  confidence: number | null;
  source: "v2-extraction" | "dream-mode";
  /**
   * Snapshot of the target memory's title + content at list time. Used by
   * the proposals UI to render diffs without needing a per-row memory
   * fetch. Null if the target was already deleted.
   */
  memorySnapshot: { title: string; content: string } | null;
  /**
   * Title + content snapshots for synthesis proposals' source memories,
   * so the UI can render the "derived from" panel without a per-row
   * fetch. Empty for non-synthesis kinds.
   */
  sourceMemorySnapshots: { id: string; title: string; content: string }[];
}

/**
 * Live list of pending proposals + helpers to approve/reject. Backed by
 * TanStack Query so mutations invalidate the cache for an instant refresh.
 *
 * V2 fact-extraction surfaces UPDATE/DELETE proposals here — the user
 * approves before any destructive change actually happens.
 */
export function useProposals() {
  const { isAuthenticated } = useConvexAuth();
  const listAction = useAction(api.proposedUpdateApi.listProposedUpdates);
  const resolveAction = useAction(api.proposedUpdateApi.resolveProposal);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["proposals"],
    enabled: isAuthenticated,
    queryFn: async (): Promise<ProposedUpdate[]> => {
      const data = await listAction({});
      // Convex action return shape is already structurally identical —
      // we map to clip any extra fields and pin the kind/source unions.
      return data.map((p): ProposedUpdate => {
        const kind: ProposedUpdateKind =
          p.kind === "delete" ||
          p.kind === "insight" ||
          p.kind === "connection" ||
          p.kind === "contradiction" ||
          p.kind === "anomaly" ||
          p.kind === "merge"
            ? p.kind
            : "update";
        const source: ProposedUpdate["source"] =
          p.source === "dream-mode" ? "dream-mode" : "v2-extraction";
        return {
          id: p.id,
          memoryId: p.memoryId,
          proposedContent: p.proposedContent,
          proposedTitle: p.proposedTitle,
          reason: p.reason,
          kind,
          status: p.status,
          createdAt: p.createdAt,
          resolvedAt: p.resolvedAt,
          sourceMemoryIds: p.sourceMemoryIds,
          confidence: p.confidence,
          source,
          memorySnapshot: p.memorySnapshot,
          sourceMemorySnapshots: p.sourceMemorySnapshots,
        };
      });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (input: {
      proposalId: string;
      action: "approve" | "reject";
      winnerMemoryId?: string;
    }) => {
      return await resolveAction({
        proposalId: input.proposalId,
        action: input.action,
        winnerMemoryId: input.winnerMemoryId,
      });
    },
    onSuccess: () => {
      // Approving a delete proposal hard-deletes the underlying memory,
      // so we invalidate memories cache too. Approving an update mutates
      // memory.content. Either way the memory list needs a refresh.
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  const approve = useCallback(
    (proposalId: string) =>
      resolveMutation.mutateAsync({ proposalId, action: "approve" }),
    [resolveMutation],
  );

  const reject = useCallback(
    (proposalId: string) =>
      resolveMutation.mutateAsync({ proposalId, action: "reject" }),
    [resolveMutation],
  );

  /** Contradiction resolution: keep `winnerMemoryId`, suppress the rest. */
  const keepWinner = useCallback(
    (proposalId: string, winnerMemoryId: string) =>
      resolveMutation.mutateAsync({
        proposalId,
        action: "approve",
        winnerMemoryId,
      }),
    [resolveMutation],
  );

  const proposals = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const pendingCount = useMemo(
    () => proposals.filter((p) => p.status === "pending").length,
    [proposals],
  );

  return {
    proposals,
    pendingCount,
    isLoading: listQuery.isLoading,
    isResolving: resolveMutation.isPending,
    approve,
    reject,
    keepWinner,
  };
}
