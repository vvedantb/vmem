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
  pending: "bg-muted-foreground/50",
  syncing: "bg-blue-500",
  synced: "bg-emerald-500",
  error: "bg-destructive",
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
        "flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left cursor-pointer transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        selected
          ? "bg-muted/40 text-foreground"
          : "hover:bg-card/45 dark:hover:bg-muted/40",
      )}
    >
      {codebase.avatarUrl ? (
        <img
          src={codebase.avatarUrl}
          alt={codebase.repoOwner}
          width={28}
          height={28}
          className="size-7 shrink-0 rounded-full outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
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
              className="shrink-0 text-muted-foreground"
              aria-label="Private repository"
            />
          ) : null}
          {codebase.status === "syncing" ? (
            <IconLoader2
              size={12}
              className="shrink-0 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
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
