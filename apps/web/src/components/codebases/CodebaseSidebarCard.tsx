"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@vmem/ui";
import { IconLoader2, IconLock } from "@tabler/icons-react";
import {
  codebaseLanguageColors,
  type CodebaseItem,
} from "./CodebaseCardInsides";

interface CodebaseSidebarCardProps {
  codebase: CodebaseItem;
  selected?: boolean;
  onSelect: () => void;
}

const statusDotClass: Record<CodebaseItem["status"], string> = {
  pending: "bg-default",
  syncing: "bg-warning",
  synced: "bg-success",
  error: "bg-danger",
};

export function CodebaseSidebarCard({
  codebase,
  selected,
  onSelect,
}: CodebaseSidebarCardProps) {
  const langColor = codebase.language
    ? (codebaseLanguageColors[codebase.language] ?? "#8b8b8b")
    : null;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${codebase.repoFullName}, ${codebase.status}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        selected
          ? "bg-surface-secondary/40 text-foreground"
          : "hover:bg-surface-tertiary/50",
      )}
    >
      {codebase.avatarUrl ? (
        <img
          src={codebase.avatarUrl}
          alt={codebase.repoOwner}
          width={28}
          height={28}
          className="size-7 shrink-0 rounded-full outline outline-1 -outline-offset-1 outline-foreground/10"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            statusDotClass[codebase.status],
          )}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm font-semibold text-foreground">
            {codebase.repoName}
          </span>
          {codebase.isPrivate ? (
            <IconLock
              size={12}
              className="shrink-0 text-muted"
              aria-label="Private repository"
            />
          ) : null}
          {codebase.status === "syncing" ? (
            <IconLoader2
              size={12}
              className="shrink-0 animate-spin text-muted"
              aria-hidden
            />
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted">
          <span className="truncate">{codebase.repoOwner}</span>
          {codebase.language ? (
            <>
              <span className="shrink-0">·</span>
              <span className="flex shrink-0 items-center gap-1">
                {langColor ? (
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: langColor }}
                  />
                ) : null}
                {codebase.language}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
