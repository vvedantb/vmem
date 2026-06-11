"use client";

import { Link } from "@tanstack/react-router";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { Badge, Button, Progress, type BadgeProps } from "@vmem/ui";
import {
  IconAlertTriangle,
  IconArrowsJoin,
  IconBulb,
  IconCheck,
  IconLink,
  IconQuestionMark,
  IconX,
  type TablerIcon,
} from "@tabler/icons-react";
import type { ProposedUpdate, ProposedUpdateKind } from "@/hooks/useProposals";
import { proposalAccentClass } from "./_proposalUtils";
import { ProposalFieldLabel, ProposalShell } from "./ProposalShell";

interface SynthesisProposalCardProps {
  proposal: ProposedUpdate;
  isResolving: boolean;
  onApprove: () => void;
  onReject: () => void;
  /** Contradictions: resolve by keeping this source memory and
   *  suppressing the rest. Renders a "Keep this" button per source. */
  onKeepWinner?: (winnerMemoryId: string) => void;
}

export default function SynthesisProposalCard({
  proposal,
  isResolving,
  onApprove,
  onReject,
  onKeepWinner,
}: SynthesisProposalCardProps) {
  const activeProfile = useActiveProfile();
  const meta = getKindMeta(proposal.kind);
  const isDismissOnly =
    proposal.kind === "contradiction" || proposal.kind === "anomaly";
  const isMerge = proposal.kind === "merge";
  const title = proposal.proposedTitle ?? "(untitled synthesis)";
  const confidencePct =
    proposal.confidence === null ? null : Math.round(proposal.confidence * 100);
  const sourceCount = proposal.sourceMemorySnapshots.length;
  const canPickWinner =
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
          <Badge variant={meta.variant} className="gap-1.5">
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
            {isDismissOnly ? "Dismiss" : "Reject"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onApprove}
            disabled={isResolving}
          >
            <IconCheck size={14} />
            {isDismissOnly ? "Acknowledge" : isMerge ? "Merge" : "Approve"}
          </Button>
        </>
      }
    >
      <div className="rounded-lg bg-surface-secondary/60 p-3">
        <ProposalFieldLabel>
          {isMerge ? "Consolidated memory" : "Synthesis"}
        </ProposalFieldLabel>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          {proposal.proposedContent}
        </p>
      </div>

      {proposal.reason.trim().length > 0 && (
        <div className="rounded-lg bg-surface-secondary/50 p-3">
          <ProposalFieldLabel>Why</ProposalFieldLabel>
          <p className="whitespace-pre-wrap break-words text-sm text-muted">
            {proposal.reason}
          </p>
        </div>
      )}

      {sourceCount > 0 && (
        <div className="rounded-lg bg-surface-secondary/50 p-3">
          <ProposalFieldLabel>
            {isMerge ? "Replaces" : "Derived from"} {sourceCount}{" "}
            {sourceCount === 1 ? "memory" : "memories"}
          </ProposalFieldLabel>
          {canPickWinner && (
            <p className="mb-1 text-xs text-muted">
              Keep one to resolve the conflict — the others get suppressed.
              Acknowledge instead if both should stay.
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {proposal.sourceMemorySnapshots.map((src) => (
              <div key={src.id} className="flex min-w-0 items-center gap-1">
                <Link
                  to="/$profileId/memories/graph"
                  params={{ profileId: activeProfile._id }}
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
                {canPickWinner && (
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

interface KindMeta {
  label: string;
  variant: BadgeProps["variant"];
  Icon: TablerIcon;
}

function getKindMeta(kind: ProposedUpdateKind): KindMeta {
  switch (kind) {
    case "insight":
      return { label: "Insight", variant: "default", Icon: IconBulb };
    case "connection":
      return { label: "Connection", variant: "secondary", Icon: IconLink };
    case "contradiction":
      return {
        label: "Contradiction",
        variant: "destructive",
        Icon: IconAlertTriangle,
      };
    case "anomaly":
      return { label: "Anomaly", variant: "warning", Icon: IconQuestionMark };
    case "merge":
      return { label: "Merge", variant: "secondary", Icon: IconArrowsJoin };
    default:
      return { label: "Synthesis", variant: "outline", Icon: IconBulb };
  }
}
