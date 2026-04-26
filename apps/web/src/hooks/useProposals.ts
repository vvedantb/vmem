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
 */
export interface ProposedUpdate {
  id: string;
  memoryId: string;
  proposedContent: string;
  reason: string;
  /** "update" rewrites memory.content. "delete" hard-deletes on approve. */
  kind: "update" | "delete";
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  /**
   * Snapshot of the target memory's title + content at list time. Used by
   * the proposals UI to render diffs without needing a per-row memory
   * fetch. Null if the target was already deleted.
   */
  memorySnapshot: { title: string; content: string } | null;
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
      // we just map to clip any extra fields and pin the kind union.
      return data.map((p) => ({
        id: p.id,
        memoryId: p.memoryId,
        proposedContent: p.proposedContent,
        reason: p.reason,
        kind: p.kind === "delete" ? "delete" : "update",
        status: p.status,
        createdAt: p.createdAt,
        resolvedAt: p.resolvedAt,
        memorySnapshot: p.memorySnapshot,
      }));
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (input: {
      proposalId: string;
      action: "approve" | "reject";
    }) => {
      return await resolveAction({
        proposalId: input.proposalId,
        action: input.action,
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
  };
}
