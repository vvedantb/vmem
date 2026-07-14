"use client";

import { useCallback, useMemo } from "react";
import { useConvexAuth, useAction } from "convex/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@vmem/backend";
import { useActiveProfileId } from "@/components/workspace/active-profile";

const proposedUpdateKindSchema = z.enum([
  "update",
  "delete",
  "insight",
  "connection",
  "contradiction",
  "anomaly",
  "merge",
]);

export type ProposedUpdateKind = z.infer<typeof proposedUpdateKindSchema>;

const proposalSourceSchema = z.enum(["v2-extraction", "dream-mode"]);

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
  source: z.infer<typeof proposalSourceSchema>;
  // target memory title/content at list time (null if deleted)
  memorySnapshot: { title: string; content: string } | null;
  // source memory snapshots for synthesis "derived from" panel
  sourceMemorySnapshots: { id: string; title: string; content: string }[];
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
      const data = await listAction({ profileId: activeProfileId });
      return data.map((p): ProposedUpdate => {
        const kind = proposedUpdateKindSchema.catch("update").parse(p.kind);
        const source = proposalSourceSchema
          .catch("v2-extraction")
          .parse(p.source);
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
