"use client";

import { createFileRoute } from "@tanstack/react-router";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
} from "@vmem/ui";
import { IconCheck, IconX, IconPencil, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import PageContainer from "@/components/PageContainer";
import { useProposals, type ProposedUpdate } from "@/hooks/useProposals";

export const Route = createFileRoute("/_main/proposals")({
  component: ProposalsPage,
});

/**
 * Proposals inbox.
 *
 * V2 fact-extraction never silently overwrites or deletes existing
 * memories — it surfaces a UPDATE/DELETE proposal here for the user to
 * approve or reject. Approving an UPDATE rewrites memory.content;
 * approving a DELETE hard-deletes the memory.
 *
 * Empty state is the steady state: most prompts produce ADDs, not
 * conflicts.
 */
function ProposalsPage() {
  const { proposals, pendingCount, isLoading, isResolving, approve, reject } =
    useProposals();

  return (
    <PageContainer
      title="Proposals"
      centeredMaxWidth
      rightSection={
        pendingCount > 0 ? (
          <Badge variant="outline" className="text-xs tabular-nums">
            {pendingCount} pending
          </Badge>
        ) : null
      }
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : proposals.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              isResolving={isResolving}
              onApprove={async () => {
                try {
                  await approve(p.id);
                  toast.success(
                    p.kind === "delete" ? "Memory deleted" : "Memory updated",
                  );
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to approve",
                  );
                }
              }}
              onReject={async () => {
                try {
                  await reject(p.id);
                  toast.success("Proposal dismissed");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to reject",
                  );
                }
              }}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function ProposalCard({
  proposal,
  isResolving,
  onApprove,
  onReject,
}: {
  proposal: ProposedUpdate;
  isResolving: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const targetTitle = proposal.memorySnapshot?.title ?? "(memory unavailable)";
  const targetContent = proposal.memorySnapshot?.content ?? "";

  return (
    <Card className="bg-muted/40">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {proposal.kind === "delete" ? (
                <>
                  <IconTrash size={14} />
                  <span>Proposed deletion</span>
                </>
              ) : (
                <>
                  <IconPencil size={14} />
                  <span>Proposed update</span>
                </>
              )}
              <span>·</span>
              <span title={proposal.createdAt}>
                {formatRelativeDate(proposal.createdAt)}
              </span>
            </div>
            <CardTitle className="text-base text-foreground truncate">
              {targetTitle}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onReject}
              disabled={isResolving}
              className="text-muted-foreground hover:text-foreground"
            >
              <IconX size={14} />
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onApprove}
              disabled={isResolving}
              className={
                proposal.kind === "delete"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground"
              }
            >
              <IconCheck size={14} />
              {proposal.kind === "delete" ? "Approve delete" : "Approve update"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Reason text={proposal.reason} />
        {proposal.kind === "update" ? (
          <UpdateDiff
            oldText={targetContent}
            newText={proposal.proposedContent}
          />
        ) : (
          <DeleteSnapshot text={targetContent} />
        )}
      </CardContent>
    </Card>
  );
}

function Reason({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="rounded-lg bg-background/40 p-3 text-sm text-muted-foreground">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">
        Reason
      </div>
      <p className="whitespace-pre-wrap break-words">{text}</p>
    </div>
  );
}

function UpdateDiff({
  oldText,
  newText,
}: {
  oldText: string;
  newText: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg bg-background/40 p-3">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">
          Current
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {oldText || "(empty)"}
        </p>
      </div>
      <div className="rounded-lg bg-primary/10 p-3">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">
          Proposed
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {newText}
        </p>
      </div>
    </div>
  );
}

function DeleteSnapshot({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-destructive/10 p-3">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">
        Memory body (will be deleted)
      </div>
      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
        {text || "(empty)"}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-muted/40 p-6 space-y-3">
          <Skeleton className="h-4 w-48 rounded" />
          <Skeleton className="h-3 w-72 rounded" />
          <Skeleton className="h-20 w-full rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <IconCheck size={32} className="text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-lg font-medium text-foreground">
        No pending proposals
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        When vmem detects that a new fact contradicts something you said
        earlier, it surfaces a proposal here for review.
      </p>
    </div>
  );
}

/**
 * Compact relative-date helper for the proposal card header. Intentionally
 * simple — the full timestamp is in the `title` attribute for hover.
 */
function formatRelativeDate(iso: string): string {
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
