import { Button } from "@vmem/ui";
import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import { proposalAccentClass, type ProposedUpdate } from "./_proposalUtils";
import {
  ProposalMutedTextBlock,
  ProposalShell,
  ProposalTextBlock,
} from "./ProposalShell";

type UpdateProposalCardProps = {
  proposal: ProposedUpdate;
  isResolving: boolean;
  onApprove: () => void;
  onReject: () => void;
};

export function UpdateProposalCard(props: UpdateProposalCardProps) {
  if (props.proposal.kind === "delete") {
    return <DeleteUpdateProposalCard {...props} />;
  }
  return <EditUpdateProposalCard {...props} />;
}

function UpdateProposalRejectButton({
  isResolving,
  onReject,
}: {
  isResolving: boolean;
  onReject: () => void;
}) {
  return (
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
  );
}

function DeleteUpdateProposalCard({
  proposal,
  isResolving,
  onApprove,
  onReject,
}: UpdateProposalCardProps) {
  const targetTitle = proposal.memorySnapshot?.title ?? "(memory unavailable)";
  const targetContent = proposal.memorySnapshot?.content ?? "";

  return (
    <ProposalShell
      accentClass={proposalAccentClass(proposal.kind)}
      title={targetTitle}
      timestamp={proposal.createdAt}
      meta={
        <span className="inline-flex items-center gap-1.5">
          <IconTrash size={14} />
          Proposed deletion
        </span>
      }
      actions={
        <>
          <UpdateProposalRejectButton
            isResolving={isResolving}
            onReject={onReject}
          />
          <Button
            type="button"
            size="sm"
            onClick={onApprove}
            disabled={isResolving}
            className="bg-danger text-danger-foreground"
          >
            <IconCheck size={14} />
            Approve delete
          </Button>
        </>
      }
    >
      {proposal.reason.trim() !== "" && (
        <ProposalMutedTextBlock label="Reason">
          {proposal.reason}
        </ProposalMutedTextBlock>
      )}
      <ProposalTextBlock
        label="Memory body (will be deleted)"
        className="bg-danger/10"
      >
        {targetContent || "(empty)"}
      </ProposalTextBlock>
    </ProposalShell>
  );
}

function EditUpdateProposalCard({
  proposal,
  isResolving,
  onApprove,
  onReject,
}: UpdateProposalCardProps) {
  const targetTitle = proposal.memorySnapshot?.title ?? "(memory unavailable)";
  const targetContent = proposal.memorySnapshot?.content ?? "";

  return (
    <ProposalShell
      accentClass={proposalAccentClass(proposal.kind)}
      title={targetTitle}
      timestamp={proposal.createdAt}
      meta={
        <span className="inline-flex items-center gap-1.5">
          <IconPencil size={14} />
          Proposed update
        </span>
      }
      actions={
        <>
          <UpdateProposalRejectButton
            isResolving={isResolving}
            onReject={onReject}
          />
          <Button
            type="button"
            size="sm"
            onClick={onApprove}
            disabled={isResolving}
            className="bg-surface text-foreground"
          >
            <IconCheck size={14} />
            Approve update
          </Button>
        </>
      }
    >
      {proposal.reason.trim() !== "" && (
        <ProposalMutedTextBlock label="Reason">
          {proposal.reason}
        </ProposalMutedTextBlock>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProposalMutedTextBlock label="Current">
          {targetContent || "(empty)"}
        </ProposalMutedTextBlock>
        <ProposalTextBlock label="Proposed" className="bg-surface-secondary/70">
          {proposal.proposedContent}
        </ProposalTextBlock>
      </div>
    </ProposalShell>
  );
}
