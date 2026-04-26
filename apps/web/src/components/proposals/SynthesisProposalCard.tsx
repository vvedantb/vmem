"use client";

import { Link } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  type BadgeProps,
} from "@vmem/ui";
import {
  IconAlertTriangle,
  IconBulb,
  IconCheck,
  IconLink,
  IconQuestionMark,
  IconX,
  type TablerIcon,
} from "@tabler/icons-react";
import type { ProposedUpdate, ProposedUpdateKind } from "@/hooks/useProposals";

/**
 * Card variant for Dream Mode V2 synthesis proposals — `insight`,
 * `connection`, `contradiction`, `anomaly`.
 *
 * Differs from the standard update/delete card in that there's no
 * "current vs proposed" diff to render — synthesis materializes a NEW
 * memory rather than rewriting an existing one. Instead we surface:
 *  - kind-specific badge + iconography
 *  - the synthesized title + content
 *  - a confidence bar (LLM-reported)
 *  - the source memory list with deep links so the user can verify the
 *    derivation before approving
 *
 * Dismiss-only kinds: contradictions and anomalies are flags, not new
 * knowledge. Both approve and reject simply clear the proposal — no new
 * memory is created. For these the buttons read "Acknowledge" / "Dismiss"
 * to make the no-op-on-the-graph behavior explicit. (Anomalies were
 * previously materialized as memories, but the resulting "memory talking
 * about a memory" had no tags or connections; V1 now treats them as a
 * flag the user reviews against the source memory.)
 */
interface SynthesisProposalCardProps {
  proposal: ProposedUpdate;
  isResolving: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export default function SynthesisProposalCard({
  proposal,
  isResolving,
  onApprove,
  onReject,
}: SynthesisProposalCardProps) {
  const meta = getKindMeta(proposal.kind);
  // Dismiss-only kinds — see component-level comment for rationale.
  const isDismissOnly =
    proposal.kind === "contradiction" || proposal.kind === "anomaly";
  const title = proposal.proposedTitle ?? "(untitled synthesis)";
  const confidencePct =
    proposal.confidence === null ? null : Math.round(proposal.confidence * 100);
  const sourceCount = proposal.sourceMemorySnapshots.length;

  return (
    <Card className="bg-muted/40">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={meta.variant} className="gap-1.5">
                <meta.Icon size={12} />
                {meta.label}
              </Badge>
              <span title={proposal.createdAt}>
                {formatRelativeDate(proposal.createdAt)}
              </span>
              <span aria-hidden>·</span>
              <span>Dream Mode</span>
            </div>
            <CardTitle className="text-base text-foreground">{title}</CardTitle>
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
              {isDismissOnly ? "Dismiss" : "Reject"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onApprove}
              disabled={isResolving}
              className="bg-primary text-primary-foreground"
            >
              <IconCheck size={14} />
              {isDismissOnly ? "Acknowledge" : "Approve"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Synthesis body — what the LLM produced. */}
        <div className="rounded-lg bg-primary/10 p-3">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">
            Synthesis
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            {proposal.proposedContent}
          </p>
        </div>

        {proposal.reason.trim().length > 0 && (
          <div className="rounded-lg bg-background/40 p-3 text-sm text-muted-foreground">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-1">
              Why
            </div>
            <p className="whitespace-pre-wrap break-words">{proposal.reason}</p>
          </div>
        )}

        {sourceCount > 0 && (
          <div className="rounded-lg bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mb-2">
              Derived from {sourceCount}{" "}
              {sourceCount === 1 ? "memory" : "memories"}
            </div>
            <div className="flex flex-col gap-1.5">
              {proposal.sourceMemorySnapshots.map((src) => (
                <Link
                  key={src.id}
                  to="/memories"
                  search={{ view: "graph", focus: src.id }}
                  className="group flex min-w-0 items-baseline gap-2 text-sm transition-colors hover:bg-muted/40 rounded px-1 py-0.5 -mx-1"
                >
                  <span className="truncate text-foreground/80 group-hover:text-foreground">
                    {src.title || "(untitled)"}
                  </span>
                  {src.content && (
                    <span className="truncate text-xs text-muted-foreground/60">
                      {src.content.slice(0, 80)}
                      {src.content.length > 80 ? "…" : ""}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {confidencePct !== null && (
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-[11px] uppercase tracking-widest text-muted-foreground/70">
              Confidence
            </span>
            <Progress value={confidencePct} className="flex-1" />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {confidencePct}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface KindMeta {
  label: string;
  variant: BadgeProps["variant"];
  Icon: TablerIcon;
}

/**
 * Visual mapping for the four synthesis kinds. Falls back to a neutral
 * outline badge if a future kind sneaks in without a meta entry.
 */
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
    default:
      // update / delete — rendered by the standard ProposalCard, never here.
      return { label: "Synthesis", variant: "outline", Icon: IconBulb };
  }
}

/**
 * Mirrors the helper in `proposals.tsx`. Kept local so this card stays
 * self-contained — the duplication is 12 lines, cheaper than a shared
 * utility module for two callers.
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
