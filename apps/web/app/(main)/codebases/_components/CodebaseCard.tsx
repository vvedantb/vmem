"use client";

import Link from "next/link";
import Image from "next/image";
import type { MouseEvent, ReactNode } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Badge,
  Card,
  CardContent,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vmem/ui";
import {
  IconGitBranch,
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconClock,
  IconDots,
  IconRefresh,
  IconTrash,
  IconExternalLink,
  IconFile,
  IconArrowsJoin,
  IconLock,
} from "@tabler/icons-react";
import { toast } from "sonner";

const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  PHP: "#4F5D95",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Lua: "#000080",
  Zig: "#ec915c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

const statusConfig = {
  pending: {
    label: "Pending",
    icon: IconClock,
    variant: "secondary" as const,
  },
  syncing: {
    label: "Syncing...",
    icon: IconLoader2,
    variant: "default" as const,
  },
  synced: {
    label: "Synced",
    icon: IconCheck,
    variant: "success" as const,
  },
  error: {
    label: "Error",
    icon: IconAlertTriangle,
    variant: "destructive" as const,
  },
};

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

type CodebaseItem = FunctionReturnType<typeof api.codebases.listMy>[number];

interface CodebaseCardProps {
  codebase: CodebaseItem;
}

interface CodebaseCardInsidesProps {
  codebase: CodebaseItem;
  headerMenuSlot: ReactNode;
}

function CodebaseCardInsides({
  codebase,
  headerMenuSlot,
}: CodebaseCardInsidesProps) {
  const status = statusConfig[codebase.status];
  const StatusIcon = status.icon;
  const langColor = codebase.language
    ? (languageColors[codebase.language] ?? "#8b8b8b")
    : null;
  const progress =
    codebase.totalFiles > 0
      ? Math.round((codebase.syncedFiles / codebase.totalFiles) * 100)
      : 0;

  return (
    <Card className="group border border-border bg-muted/50 shadow-none hover:border-border/80 hover:bg-muted/80 transition-colors cursor-pointer">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            {codebase.avatarUrl && (
              <Image
                src={codebase.avatarUrl}
                alt={codebase.repoOwner}
                width={20}
                height={20}
                className="rounded-full mt-0.5 shrink-0"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-medium text-foreground truncate text-sm">
                  <span className="text-muted-foreground font-normal">
                    {codebase.repoOwner}/
                  </span>
                  {codebase.repoName}
                </h3>
                {codebase.isPrivate && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                  >
                    <IconLock size={10} className="mr-0.5" />
                    Private
                  </Badge>
                )}
              </div>
              {codebase.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {codebase.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant={status.variant}>
              <StatusIcon
                size={12}
                className={codebase.status === "syncing" ? "animate-spin" : ""}
              />
              {status.label}
            </Badge>
            {headerMenuSlot}
          </div>
        </div>

        {codebase.status === "error" && codebase.errorMessage && (
          <p className="mt-2 text-xs text-destructive line-clamp-1">
            {codebase.errorMessage}
          </p>
        )}

        {codebase.status === "syncing" && codebase.totalFiles > 0 && (
          <div className="mt-3">
            <div className="h-1 w-full rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-blue-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {langColor && codebase.language && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: langColor }}
              />
              {codebase.language}
            </span>
          )}
          <span className="flex items-center gap-1">
            <IconGitBranch size={13} />
            {codebase.defaultBranch}
          </span>
          {codebase.totalFiles > 0 && (
            <span className="flex items-center gap-1">
              <IconFile size={13} />
              {codebase.totalFiles.toLocaleString()} files
            </span>
          )}
          {codebase.totalEdges !== undefined && codebase.totalEdges > 0 && (
            <span className="flex items-center gap-1">
              <IconArrowsJoin size={13} />
              {codebase.totalEdges.toLocaleString()} imports
            </span>
          )}
          {codebase.lastSyncedAt && (
            <span className="ml-auto text-muted-foreground/70">
              Synced {timeAgo(codebase.lastSyncedAt)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CodebaseCard({ codebase }: CodebaseCardProps) {
  const syncCodebase = useAction(api.codebases.syncCodebase);
  const removeCodebase = useMutation(api.codebases.removeCodebase);

  const handleSync = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await syncCodebase({ id: codebase._id });
      toast.success(`Syncing ${codebase.repoName}...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await removeCodebase({ id: codebase._id });
      toast.success(`Removed ${codebase.repoName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast.error(msg);
    }
  };

  const href = `/codebases/${codebase._id}`;

  const dropdownMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
        >
          <IconDots size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={handleSync}>
          <IconRefresh size={14} className="mr-2" />
          Re-sync
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={`https://github.com/${codebase.repoFullName}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <IconExternalLink size={14} className="mr-2" />
            View on GitHub
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <IconTrash size={14} className="mr-2" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const contextMenuItems = (
    <>
      <ContextMenuItem onClick={handleSync}>
        <IconRefresh size={14} className="mr-2" />
        Re-sync
      </ContextMenuItem>
      <ContextMenuItem asChild>
        <a
          href={`https://github.com/${codebase.repoFullName}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <IconExternalLink size={14} className="mr-2" />
          View on GitHub
        </a>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={handleDelete}
        className="text-destructive focus:text-destructive"
      >
        <IconTrash size={14} className="mr-2" />
        Remove
      </ContextMenuItem>
    </>
  );

  return (
    <>
      <div className="sm:hidden">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Link href={href} className="block">
              <CodebaseCardInsides codebase={codebase} headerMenuSlot={null} />
            </Link>
          </ContextMenuTrigger>
          <ContextMenuContent onClick={(e) => e.stopPropagation()}>
            {contextMenuItems}
          </ContextMenuContent>
        </ContextMenu>
      </div>

      <div className="hidden sm:block">
        <Link href={href}>
          <CodebaseCardInsides
            codebase={codebase}
            headerMenuSlot={dropdownMenu}
          />
        </Link>
      </div>
    </>
  );
}
