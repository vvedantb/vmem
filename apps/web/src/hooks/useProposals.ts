import { useConvexAuth, useAction } from "convex/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { useActiveProfileId } from "@/components/workspace/active-profile";

export type { ProposedUpdate } from "@/components/proposals/_proposalUtils";
export {
  isSynthesisKind,
  proposalApproveToast,
} from "@/components/proposals/_proposalUtils";

// pending proposals plus approve and reject
export function useProposals() {
  const { isAuthenticated } = useConvexAuth();
  const activeProfileId = useActiveProfileId();
  const listAction = useAction(api.proposedUpdateApi.listProposedUpdates);
  const resolveAction = useAction(api.proposedUpdateApi.resolveProposal);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["proposals", activeProfileId],
    enabled: isAuthenticated && activeProfileId !== undefined,
    queryFn: async () => {
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
      // pass the profile so team approvals can find owner attributed memories
      return await resolveAction({
        proposalId: input.proposalId,
        action: input.action,
        winnerMemoryId: input.winnerMemoryId,
        profileId: activeProfileId,
      });
    },
    onSuccess: () => {
      // delete approval removes the memory, so refresh both lists
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  const proposals = listQuery.data ?? [];
  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  return {
    proposals,
    pendingCount,
    isLoading: listQuery.isLoading,
    isResolving: resolveMutation.isPending,
    approve: (proposalId: string) =>
      resolveMutation.mutateAsync({ proposalId, action: "approve" }),
    reject: (proposalId: string) =>
      resolveMutation.mutateAsync({ proposalId, action: "reject" }),
    keepWinner: (proposalId: string, winnerMemoryId: string) =>
      resolveMutation.mutateAsync({
        proposalId,
        action: "approve",
        winnerMemoryId,
      }),
  };
}
