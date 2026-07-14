"use client";

import { useCallback, useMemo } from "react";
import { useConvexAuth, useAction } from "convex/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { useActiveProfileId } from "@/components/workspace/active-profile";
import type {
  ProposedUpdate,
  ProposedUpdateKind,
} from "@/components/proposals/_proposalUtils";

export type { ProposedUpdate, ProposedUpdateKind };

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

// pending proposals + approve/reject (tanstack cache)
export function useProposals() {
  const { isAuthenticated } = useConvexAuth();
  const activeProfileId = useActiveProfileId();
  const listAction = useAction(api.proposedUpdateApi.listProposedUpdates);
  const resolveAction = useAction(api.proposedUpdateApi.resolveProposal);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["proposals", activeProfileId],
    enabled: isAuthenticated && activeProfileId !== undefined,
    queryFn: async (): Promise<ProposedUpdate[]> => {
      if (activeProfileId === undefined) return [];
      return await listAction({ profileId: activeProfileId });
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
      // approving a delete proposal hard-deletes the underlying memory, so we invalidate
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

  // contradiction resolution: keep `winnerMemoryId`, suppress the rest
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
