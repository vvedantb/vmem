import { Button } from "@vmem/ui";
import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import type { ProposedUpdate } from "@/hooks/useProposals";
import { proposalAccentClass } from "./_proposalUtils";
import { ProposalFieldLabel, ProposalShell } from "./ProposalShell";

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
              isDelete
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            }
          >
            <IconCheck size={14} />
            {isDelete ? "Approve delete" : "Approve update"}
          </Button>
        </>
      }
    >
      <Reason text={proposal.reason} />
      {isDelete ? (
        <DeleteSnapshot text={targetContent} />
      ) : (
        <UpdateDiff
          oldText={targetContent}
          newText={proposal.proposedContent}
        />
      )}
    </ProposalShell>
  );
}

function Reason({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <ProposalFieldLabel>Reason</ProposalFieldLabel>
      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
        {text}
      </p>
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-lg bg-muted/50 p-3">
        <ProposalFieldLabel>Current</ProposalFieldLabel>
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {oldText || "(empty)"}
        </p>
      </div>
      <div className="rounded-lg bg-muted/70 p-3">
        <ProposalFieldLabel>Proposed</ProposalFieldLabel>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          {newText}
        </p>
      </div>
    </div>
  );
}

function DeleteSnapshot({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-destructive/10 p-3">
      <ProposalFieldLabel>Memory body (will be deleted)</ProposalFieldLabel>
      <p className="whitespace-pre-wrap break-words text-sm text-foreground">
        {text || "(empty)"}
      </p>
    </div>
  );
}
