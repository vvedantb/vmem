"use client";

import { Badge, cn } from "@vmem/ui";
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
    className: "border-border bg-default text-default-foreground",
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
      className: "bg-surface-secondary text-muted",
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
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg p-3 transition-colors",
        isSelected
          ? "bg-accent/10 ring-1 ring-accent/30"
          : "bg-surface-secondary/30 hover:bg-surface-secondary/50",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-sm font-semibold text-foreground">
          v{version.version}
        </span>
        <Badge className={cn("text-xs", style.className)}>{style.label}</Badge>
        <span className="text-xs text-muted">
          {formatTimestamp(version.createdAt)}
        </span>
        <span className="text-xs text-muted">by {version.actor}</span>
      </div>

      {/* Change summary */}
      {version.changeSummary !== null && (
        <div className="flex items-center gap-2 flex-wrap mb-2 text-xs">
          {version.changeSummary.addedChars > 0 && (
            <span className="text-success">
              +{version.changeSummary.addedChars} chars
            </span>
          )}
          {version.changeSummary.removedChars > 0 && (
            <span className="text-danger">
              -{version.changeSummary.removedChars} chars
            </span>
          )}
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
      )}

      {/* Title change */}
      {titleChanged && previousVersion !== null && (
        <div className="text-sm mb-2">
          <span className="text-muted line-through">
            {previousVersion.snapshot.title}
          </span>
          {" -> "}
          <span className="text-foreground font-medium">
            {version.snapshot.title}
          </span>
        </div>
      )}

      {/* Content diff or snapshot */}
      {isSelected && (
        <div className="mt-3">
          {showDiff && previousVersion !== null ? (
            <DiffDisplay
              oldText={previousVersion.snapshot.content}
              newText={version.snapshot.content}
            />
          ) : (
            <div className="rounded-lg bg-surface-secondary/50 p-3 text-sm whitespace-pre-wrap">
              {version.snapshot.content}
            </div>
          )}
        </div>
      )}
    </button>
  );
}
