import { Button } from "@vmem/ui";
import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import type { ProposedUpdate } from "@/hooks/useProposals";
import { proposalAccentClass } from "./_proposalUtils";
import { ProposalShell, ProposalTextBlock } from "./ProposalShell";

export function UpdateProposalCard({
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
  const isDelete = proposal.kind === "delete";

  return (
    <ProposalShell
      accentClass={proposalAccentClass(proposal.kind)}
      title={targetTitle}
      timestamp={proposal.createdAt}
      meta={
        <span className="inline-flex items-center gap-1.5">
          {isDelete ? (
            <>
              <IconTrash size={14} />
              Proposed deletion
            </>
          ) : (
            <>
              <IconPencil size={14} />
              Proposed update
            </>
          )}
        </span>
      }
      actions={
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReject}
            disabled={isResolving}
            className="text-muted hover:text-foreground"
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
              isDelete
                ? "bg-danger text-danger-foreground"
                : "bg-surface text-foreground"
            }
          >
            <IconCheck size={14} />
            {isDelete ? "Approve delete" : "Approve update"}
          </Button>
        </>
      }
    >
      {proposal.reason.trim() !== "" && (
        <ProposalTextBlock label="Reason" muted>
          {proposal.reason}
        </ProposalTextBlock>
      )}
      {isDelete ? (
        <ProposalTextBlock
          label="Memory body (will be deleted)"
          className="bg-danger/10"
        >
          {targetContent || "(empty)"}
        </ProposalTextBlock>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProposalTextBlock label="Current" muted>
            {targetContent || "(empty)"}
          </ProposalTextBlock>
          <ProposalTextBlock
            label="Proposed"
            className="bg-surface-secondary/70"
          >
            {proposal.proposedContent}
          </ProposalTextBlock>
        </div>
      )}
    </ProposalShell>
  );
}
