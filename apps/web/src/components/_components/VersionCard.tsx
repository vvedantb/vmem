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
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  updated: {
    label: "Updated",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  deleted: {
    label: "Deleted",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
  proposal_approved: {
    label: "Approved",
    className:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  },
  proposal_rejected: {
    label: "Rejected",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  },
};

function getActionStyle(action: string) {
  return (
    ACTION_STYLES[action] ?? {
      label: action,
      className: "bg-muted text-muted-foreground",
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
          ? "bg-primary/10 ring-1 ring-primary/30"
          : "bg-muted/30 hover:bg-muted/50",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-sm font-semibold text-foreground">
          v{version.version}
        </span>
        <Badge className={cn("text-xs", style.className)}>{style.label}</Badge>
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(version.createdAt)}
        </span>
        <span className="text-xs text-muted-foreground">
          by {version.actor}
        </span>
      </div>

      {/* Change summary */}
      {version.changeSummary !== null && (
        <div className="flex items-center gap-2 flex-wrap mb-2 text-xs">
          {version.changeSummary.addedChars > 0 && (
            <span className="text-green-600 dark:text-green-400">
              +{version.changeSummary.addedChars} chars
            </span>
          )}
          {version.changeSummary.removedChars > 0 && (
            <span className="text-red-600 dark:text-red-400">
              -{version.changeSummary.removedChars} chars
            </span>
          )}
          {version.changeSummary.tagsAdded.map((tag) => (
            <Badge
              key={`add-${tag}`}
              variant="outline"
              className="text-xs text-green-600 dark:text-green-400"
            >
              +{tag}
            </Badge>
          ))}
          {version.changeSummary.tagsRemoved.map((tag) => (
            <Badge
              key={`rem-${tag}`}
              variant="outline"
              className="text-xs text-red-600 dark:text-red-400 line-through"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Title change */}
      {titleChanged && previousVersion !== null && (
        <div className="text-sm mb-2">
          <span className="text-muted-foreground line-through">
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
            <div className="rounded-lg bg-background/50 p-3 text-sm whitespace-pre-wrap">
              {version.snapshot.content}
            </div>
          )}
        </div>
      )}
    </button>
  );
}
