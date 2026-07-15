import type { BadgeProps } from "@vmem/ui";
import type { TablerIcon } from "@tabler/icons-react";
import {
  IconAlertTriangle,
  IconArrowsJoin,
  IconBulb,
  IconLink,
  IconPencil,
  IconQuestionMark,
  IconTrash,
} from "@tabler/icons-react";
import type { ProposedUpdateKind } from "./_proposalUtils";

export type ProposalKindConfig = {
  label: string;
  Icon: TablerIcon;
  badgeVariant: BadgeProps["variant"];
  accentClass: string;
  approveToast: string;
  updateMetaLabel?: string;
  updateApproveLabel?: string;
  synthesisContentLabel?: string;
  synthesisApproveLabel?: string;
  synthesisRejectLabel?: string;
  sourceListPrefix?: string;
};

export const PROPOSAL_KIND_CONFIG: Record<
  ProposedUpdateKind,
  ProposalKindConfig
> = {
  delete: {
    label: "Deletion",
    Icon: IconTrash,
    badgeVariant: "destructive",
    accentClass: "bg-danger",
    approveToast: "Memory deleted",
    updateMetaLabel: "Proposed deletion",
    updateApproveLabel: "Approve delete",
  },
  update: {
    label: "Update",
    Icon: IconPencil,
    badgeVariant: "secondary",
    accentClass: "bg-accent",
    approveToast: "Memory updated",
    updateMetaLabel: "Proposed update",
    updateApproveLabel: "Approve update",
  },
  insight: {
    label: "Insight",
    Icon: IconBulb,
    badgeVariant: "default",
    accentClass: "bg-surface-tertiary",
    approveToast: "Insight saved as a new memory",
    synthesisContentLabel: "Synthesis",
    synthesisApproveLabel: "Approve",
    synthesisRejectLabel: "Reject",
    sourceListPrefix: "Derived from",
  },
  connection: {
    label: "Connection",
    Icon: IconLink,
    badgeVariant: "secondary",
    accentClass: "bg-success",
    approveToast: "Connection saved as a new memory",
    synthesisContentLabel: "Synthesis",
    synthesisApproveLabel: "Approve",
    synthesisRejectLabel: "Reject",
    sourceListPrefix: "Derived from",
  },
  contradiction: {
    label: "Contradiction",
    Icon: IconAlertTriangle,
    badgeVariant: "destructive",
    accentClass: "bg-danger",
    approveToast: "Contradiction acknowledged",
    synthesisContentLabel: "Synthesis",
    synthesisApproveLabel: "Acknowledge",
    synthesisRejectLabel: "Dismiss",
    sourceListPrefix: "Derived from",
  },
  anomaly: {
    label: "Anomaly",
    Icon: IconQuestionMark,
    badgeVariant: "warning",
    accentClass: "bg-warning",
    approveToast: "Anomaly saved as a new memory",
    synthesisContentLabel: "Synthesis",
    synthesisApproveLabel: "Acknowledge",
    synthesisRejectLabel: "Dismiss",
    sourceListPrefix: "Derived from",
  },
  merge: {
    label: "Merge",
    Icon: IconArrowsJoin,
    badgeVariant: "secondary",
    accentClass: "bg-accent",
    approveToast: "Memories merged — sources superseded",
    synthesisContentLabel: "Consolidated memory",
    synthesisApproveLabel: "Merge",
    synthesisRejectLabel: "Reject",
    sourceListPrefix: "Replaces",
  },
};

export function getProposalKindConfig(
  kind: ProposedUpdateKind,
): ProposalKindConfig {
  return PROPOSAL_KIND_CONFIG[kind];
}

export function proposalAccentClass(kind: ProposedUpdateKind): string {
  return PROPOSAL_KIND_CONFIG[kind].accentClass;
}

export function proposalApproveToast(kind: ProposedUpdateKind): string {
  return PROPOSAL_KIND_CONFIG[kind].approveToast;
}

export function synthesisActionLabels(kind: ProposedUpdateKind): {
  reject: string;
  approve: string;
} {
  const config = PROPOSAL_KIND_CONFIG[kind];
  return {
    reject: config.synthesisRejectLabel ?? "Reject",
    approve: config.synthesisApproveLabel ?? "Approve",
  };
}

export function synthesisContentLabel(kind: ProposedUpdateKind): string {
  return PROPOSAL_KIND_CONFIG[kind].synthesisContentLabel ?? "Synthesis";
}

export function synthesisSourceListLabel(
  kind: ProposedUpdateKind,
  sourceCount: number,
): string {
  const noun = sourceCount === 1 ? "memory" : "memories";
  const prefix = PROPOSAL_KIND_CONFIG[kind].sourceListPrefix ?? "Derived from";
  return `${prefix} ${sourceCount} ${noun}`;
}
