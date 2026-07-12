"use client";

import { Button, cn } from "@vmem/ui";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { VersionEntry } from "@/lib/timeline";

interface VersionChainBarProps {
  versions: VersionEntry[];
  selectedVersion: number;
  onSelectVersion: (version: number) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTimeAgo(iso: string): string {
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
  return formatDate(iso);
}

export default function VersionChainBar({
  versions,
  selectedVersion,
  onSelectVersion,
}: VersionChainBarProps) {
  const total = versions.length;
  const firstVersion = versions[0];
  const lastVersion = versions[total - 1];

  const canGoBack = selectedVersion > 1;
  const canGoForward = selectedVersion < total;

  return (
    <div className="min-w-0 overflow-hidden rounded-lg bg-surface-secondary p-4">
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => canGoBack && onSelectVersion(selectedVersion - 1)}
          disabled={!canGoBack}
          className={cn(
            canGoBack
              ? "text-foreground hover:bg-surface-tertiary"
              : "cursor-not-allowed text-muted/40",
          )}
          aria-label="Previous version"
        >
          <IconChevronLeft size={16} />
        </Button>

        <div className="flex items-center gap-1.5 px-1">
          {versions.map((v) => (
            <Button
              key={v.version}
              type="button"
              variant="ghost"
              onClick={() => onSelectVersion(v.version)}
              className={cn(
                "h-2.5 min-w-0 rounded-full p-0 transition-[width,background-color]",
                v.version === selectedVersion
                  ? "w-6 bg-foreground"
                  : "w-2.5 bg-surface-tertiary hover:bg-foreground/40",
              )}
              aria-label={`Version ${v.version}`}
              aria-current={v.version === selectedVersion ? "true" : undefined}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => canGoForward && onSelectVersion(selectedVersion + 1)}
          disabled={!canGoForward}
          className={cn(
            canGoForward
              ? "text-foreground hover:bg-surface-tertiary"
              : "cursor-not-allowed text-muted/40",
          )}
          aria-label="Next version"
        >
          <IconChevronRight size={16} />
        </Button>
      </div>

      <p className="mt-3 break-words text-center text-xs text-muted">
        <span className="font-medium tabular-nums text-foreground">
          v{selectedVersion}
        </span>
        <span> of {total}</span>
        {firstVersion && lastVersion ? (
          <>
            <span className="text-muted"> · </span>
            <span>Created {formatDate(firstVersion.createdAt)}</span>
            <span className="text-muted"> · </span>
            <span>Latest {formatTimeAgo(lastVersion.createdAt)}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
