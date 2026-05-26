"use client";

import { cn } from "@vmem/ui";
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
    <div className="rounded-lg bg-surface-secondary/40 p-3 mb-4">
      {/* Version navigator */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => canGoBack && onSelectVersion(selectedVersion - 1)}
          disabled={!canGoBack}
          className={cn(
            "p-1 rounded transition-colors",
            canGoBack
              ? "hover:bg-surface-tertiary/50 text-foreground"
              : "text-muted/40 cursor-not-allowed",
          )}
          aria-label="Previous version"
        >
          <IconChevronLeft size={16} />
        </button>

        <div className="flex items-center gap-1.5">
          {versions.map((v) => (
            <button
              key={v.version}
              type="button"
              onClick={() => onSelectVersion(v.version)}
              className={cn(
                "w-3 h-3 rounded-full transition-all",
                v.version === selectedVersion
                  ? "bg-surface-tertiary scale-125"
                  : "bg-surface-secondary/40 hover:bg-surface-tertiary/50",
              )}
              aria-label={`Version ${v.version}`}
              aria-current={v.version === selectedVersion ? "true" : undefined}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => canGoForward && onSelectVersion(selectedVersion + 1)}
          disabled={!canGoForward}
          className={cn(
            "p-1 rounded transition-colors",
            canGoForward
              ? "hover:bg-surface-tertiary/50 text-foreground"
              : "text-muted/40 cursor-not-allowed",
          )}
          aria-label="Next version"
        >
          <IconChevronRight size={16} />
        </button>
      </div>

      {/* Version indicator */}
      <div className="text-center text-xs text-muted">
        <span className="font-medium text-foreground">v{selectedVersion}</span>
        {" of "}
        {total}
        {firstVersion && lastVersion && (
          <>
            {" · "}
            Created {formatDate(firstVersion.createdAt)}
            {" · "}
            Last: {formatTimeAgo(lastVersion.createdAt)}
          </>
        )}
      </div>
    </div>
  );
}
