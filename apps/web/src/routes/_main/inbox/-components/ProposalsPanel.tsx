import { Badge, Skeleton } from "@vmem/ui";
import { IconSparkles } from "@tabler/icons-react";
import { toast } from "sonner";
import RunDreamModeButton from "@/components/proposals/RunDreamModeButton";
import SynthesisProposalCard from "@/components/proposals/SynthesisProposalCard";
import { UpdateProposalCard } from "@/components/proposals/UpdateProposalCard";
import {
  isSynthesisKind,
  useProposals,
  type ProposedUpdate,
} from "@/hooks/useProposals";

export function ProposalsPanel() {
  const { proposals, isLoading, isResolving, approve, reject, pendingCount } =
    useProposals();

  const handleApprove = async (p: ProposedUpdate) => {
    try {
      await approve(p.id);
      toast.success(approveMessage(p));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    }
  };

  const handleReject = async (p: ProposedUpdate) => {
    try {
      await reject(p.id);
      toast.success("Proposal dismissed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject");
    }
  };

  if (isLoading) return <LoadingSkeleton />;
  if (proposals.length === 0) return <EmptyState />;

  const countLabel = `${String(pendingCount)} pending`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-foreground">
              Awaiting review
            </h2>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {countLabel}
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground text-balance">
            Approve to apply changes to your memory graph, or dismiss to clear
            each suggestion.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {proposals.map((p) =>
          isSynthesisKind(p.kind) ? (
            <SynthesisProposalCard
              key={p.id}
              proposal={p}
              isResolving={isResolving}
              onApprove={() => void handleApprove(p)}
              onReject={() => void handleReject(p)}
            />
          ) : (
            <UpdateProposalCard
              key={p.id}
              proposal={p}
              isResolving={isResolving}
              onApprove={() => void handleApprove(p)}
              onReject={() => void handleReject(p)}
            />
          ),
        )}
      </div>
    </div>
  );
}

export function ProposalsRightSection() {
  const { pendingCount } = useProposals();
  return (
    <div className="flex items-center gap-2">
      {pendingCount > 0 && (
        <Badge variant="outline" className="text-xs tabular-nums">
          {pendingCount} pending
        </Badge>
      )}
      <RunDreamModeButton />
    </div>
  );
}

function approveMessage(p: ProposedUpdate): string {
  switch (p.kind) {
    case "delete":
      return "Memory deleted";
    case "update":
      return "Memory updated";
    case "insight":
      return "Insight saved as a new memory";
    case "connection":
      return "Connection saved as a new memory";
    case "anomaly":
      return "Anomaly saved as a new memory";
    case "contradiction":
      return "Contradiction acknowledged";
  }
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="h-3 w-full max-w-md rounded" />
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="relative overflow-hidden rounded-xl bg-muted/40 p-5 pl-6"
        >
          <div
            className="absolute inset-y-0 left-0 w-1 bg-muted/80"
            aria-hidden
          />
          <div className="space-y-3">
            <Skeleton className="h-3 w-40 rounded" />
            <Skeleton className="h-4 w-64 rounded" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-muted/40 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
        <IconSparkles
          size={28}
          className="text-muted-foreground"
          stroke={1.5}
        />
      </div>
      <h3 className="mb-1 text-base font-medium text-foreground">
        No pending proposals
      </h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground text-balance">
        Proposals appear when vmem spots a fact conflict, or when Dream Mode
        surfaces insights, connections, and anomalies across your memories.
      </p>
      <RunDreamModeButton />
    </div>
  );
}
