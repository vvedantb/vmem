import { Link } from "@tanstack/react-router";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { Badge, Button, Progress } from "@vmem/ui";
import { IconCheck, IconX } from "@tabler/icons-react";
import {
  getProposalKindConfig,
  proposalAccentClass,
  synthesisActionLabels,
  synthesisContentLabel,
  synthesisSourceListLabel,
  type ProposedUpdate,
  type SourceMemorySnapshot,
} from "./_proposalUtils";
import {
  ProposalFieldLabel,
  ProposalMutedTextBlock,
  ProposalShell,
  ProposalTextBlock,
} from "./ProposalShell";

export default function SynthesisProposalCard({
  proposal,
  isResolving,
  onApprove,
  onReject,
  onKeepWinner,
}: {
  proposal: ProposedUpdate;
  isResolving: boolean;
  onApprove: () => void;
  onReject: () => void;
  // contradictions: resolve by keeping this source memory and suppressing the rest
  onKeepWinner?: (winnerMemoryId: string) => void;
}) {
  const activeProfile = useActiveProfile();
  const meta = getProposalKindConfig(proposal.kind);
  const actionLabels = synthesisActionLabels(proposal.kind);
  const contentLabel = synthesisContentLabel(proposal.kind);
  const title = proposal.proposedTitle ?? "(untitled synthesis)";
  const confidencePct =
    proposal.confidence === null ? null : Math.round(proposal.confidence * 100);
  const sourceCount = proposal.sourceMemorySnapshots.length;
  const showKeepWinner =
    proposal.kind === "contradiction" &&
    onKeepWinner !== undefined &&
    sourceCount >= 2;

  return (
    <ProposalShell
      accentClass={proposalAccentClass(proposal.kind)}
      title={title}
      timestamp={proposal.createdAt}
      meta={
        <>
          <Badge variant={meta.badgeVariant} className="gap-1.5">
            <meta.Icon size={12} />
            {meta.label}
          </Badge>
          <span>Dream Mode</span>
        </>
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
            {actionLabels.reject}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onApprove}
            disabled={isResolving}
          >
            <IconCheck size={14} />
            {actionLabels.approve}
          </Button>
        </>
      }
    >
      <ProposalTextBlock
        label={contentLabel}
        className="bg-surface-secondary/60"
      >
        {proposal.proposedContent}
      </ProposalTextBlock>

      {proposal.reason.trim() !== "" && (
        <ProposalMutedTextBlock label="Why">
          {proposal.reason}
        </ProposalMutedTextBlock>
      )}

      {sourceCount > 0 && (
        <div className="rounded-lg bg-surface-secondary/50 p-3">
          <ProposalFieldLabel>
            {synthesisSourceListLabel(proposal.kind, sourceCount)}
          </ProposalFieldLabel>
          {showKeepWinner && (
            <p className="mb-1 text-xs text-muted">
              Keep one to resolve the conflict — the others get suppressed.
              Acknowledge instead if both should stay.
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {proposal.sourceMemorySnapshots.map((src) => (
              <SynthesisSourceMemoryRow
                key={src.id}
                src={src}
                profileId={activeProfile._id}
                showKeepWinner={showKeepWinner}
                isResolving={isResolving}
                onKeepWinner={onKeepWinner}
              />
            ))}
          </div>
        </div>
      )}

      {confidencePct !== null && (
        <div className="pt-0.5">
          <ProposalFieldLabel>Confidence</ProposalFieldLabel>
          <div className="flex items-center gap-3">
            <Progress value={confidencePct} className="flex-1" />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
              {confidencePct}%
            </span>
          </div>
        </div>
      )}
    </ProposalShell>
  );
}

function SynthesisSourceMemoryRow({
  src,
  profileId,
  showKeepWinner,
  isResolving,
  onKeepWinner,
}: {
  src: SourceMemorySnapshot;
  profileId: string;
  showKeepWinner: boolean;
  isResolving: boolean;
  onKeepWinner?: (winnerMemoryId: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link
        to="/$profileId/memories/graph"
        params={{ profileId }}
        search={(prev) => ({ ...prev, focus: src.id })}
        className="group -mx-1 flex min-w-0 flex-1 items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm transition-[background-color] hover:bg-surface-tertiary/50"
      >
        <span className="truncate text-foreground/80 group-hover:text-foreground">
          {src.title || "(untitled)"}
        </span>
        {src.content && (
          <span className="truncate text-xs text-muted/60">
            {src.content.slice(0, 80)}
            {src.content.length > 80 ? "…" : ""}
          </span>
        )}
      </Link>
      {showKeepWinner && onKeepWinner !== undefined && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isResolving}
          onClick={() => {
            onKeepWinner(src.id);
          }}
          className="shrink-0 text-muted hover:text-foreground"
        >
          <IconCheck size={14} />
          Keep this
        </Button>
      )}
    </div>
  );
}
