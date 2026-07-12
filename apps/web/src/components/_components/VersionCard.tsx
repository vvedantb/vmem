"use client";

import { Badge, Button, cn } from "@vmem/ui";
import type { VersionEntry } from "@/lib/timeline";
import DiffDisplay from "./DiffDisplay";

interface VersionCardProps {
  version: VersionEntry;
  previousVersion: VersionEntry | null;
  isSelected: boolean;
  onSelect: () => void;
}

const ACTION_STYLES: Record<string, { label: string; className: string }> = {
  created: {
    label: "Created",
    className: "border-success/25 bg-success/12 text-success",
  },
  updated: {
    label: "Updated",
    className: "border-separator bg-default text-default-foreground",
  },
  deleted: {
    label: "Deleted",
    className: "border-danger/25 bg-danger/12 text-danger",
  },
  proposal_approved: {
    label: "Approved",
    className: "border-success/25 bg-success/12 text-success",
  },
  proposal_rejected: {
    label: "Rejected",
    className: "border-warning/25 bg-warning/12 text-warning",
  },
};

function getActionStyle(action: string) {
  return (
    ACTION_STYLES[action] ?? {
      label: action,
      className: "bg-default text-muted",
    }
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export default function VersionCard({
  version,
  previousVersion,
  isSelected,
  onSelect,
}: VersionCardProps) {
  const style = getActionStyle(version.action);
  const showDiff = previousVersion !== null;
  const titleChanged =
    previousVersion !== null &&
    previousVersion.snapshot.title !== version.snapshot.title;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "h-auto w-full min-w-0 overflow-hidden rounded-lg p-4 text-left",
        isSelected
          ? "bg-surface-tertiary"
          : "bg-surface-secondary hover:bg-surface-tertiary",
      )}
    >
      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          v{version.version}
        </span>
        <Badge className={cn("shrink-0 text-xs", style.className)}>
          {style.label}
        </Badge>
        <span className="shrink-0 text-xs text-muted">
          {formatTimestamp(version.createdAt)}
        </span>
        <span className="min-w-0 truncate text-xs text-muted">
          · {version.actor}
        </span>
      </div>

      {version.changeSummary !== null ? (
        <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-xs">
          {version.changeSummary.addedChars > 0 ? (
            <span className="text-success tabular-nums">
              +{version.changeSummary.addedChars} chars
            </span>
          ) : null}
          {version.changeSummary.removedChars > 0 ? (
            <span className="text-danger tabular-nums">
              −{version.changeSummary.removedChars} chars
            </span>
          ) : null}
          {version.changeSummary.tagsAdded.map((tag) => (
            <Badge
              key={`add-${tag}`}
              variant="outline"
              className="text-xs text-success"
            >
              +{tag}
            </Badge>
          ))}
          {version.changeSummary.tagsRemoved.map((tag) => (
            <Badge
              key={`rem-${tag}`}
              variant="outline"
              className="text-xs text-danger line-through"
            >
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {titleChanged && previousVersion !== null ? (
        <div className="mb-2 flex min-w-0 items-center gap-1 text-sm">
          <span className="min-w-0 flex-1 truncate text-muted line-through">
            {previousVersion.snapshot.title}
          </span>
          <span className="shrink-0 text-muted">→</span>
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {version.snapshot.title}
          </span>
        </div>
      ) : null}

      {isSelected ? (
        <div className="mt-3 min-w-0 overflow-hidden rounded-lg bg-surface-secondary p-3">
          {showDiff && previousVersion !== null ? (
            <DiffDisplay
              oldText={previousVersion.snapshot.content}
              newText={version.snapshot.content}
            />
          ) : (
            <p className="overflow-hidden break-words whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {version.snapshot.content}
            </p>
          )}
        </div>
      ) : (
        <p className="line-clamp-2 overflow-hidden break-words text-sm text-muted">
          {version.snapshot.content}
        </p>
      )}
    </Button>
  );
}
