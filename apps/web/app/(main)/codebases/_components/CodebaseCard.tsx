"use client";

import Link from "next/link";
import { Badge, Card, CardContent } from "@vmem/ui";
import {
  IconGitBranch,
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconClock,
} from "@tabler/icons-react";
import type { Doc } from "@vmem/backend";

/** Status display config keyed by codebase status */
const statusConfig = {
  pending: {
    label: "Pending",
    icon: IconClock,
    className: "bg-muted text-muted-foreground border-border hover:bg-muted",
  },
  syncing: {
    label: "Syncing...",
    icon: IconLoader2,
    className:
      "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/10",
  },
  synced: {
    label: "Synced",
    icon: IconCheck,
    className:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10",
  },
  error: {
    label: "Error",
    icon: IconAlertTriangle,
    className:
      "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10",
  },
};

interface CodebaseCardProps {
  codebase: Doc<"codebases">;
}

export function CodebaseCard({ codebase }: CodebaseCardProps) {
  const status = statusConfig[codebase.status];
  const StatusIcon = status.icon;
  const progress =
    codebase.totalFiles > 0
      ? Math.round((codebase.syncedFiles / codebase.totalFiles) * 100)
      : 0;

  return (
    <Link href={`/codebases/${codebase._id}`}>
      <Card className="border border-border bg-muted/50 shadow-none hover:bg-muted/80 transition-colors cursor-pointer">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-medium text-foreground truncate">
                {codebase.repoFullName}
              </h3>
              {codebase.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                  {codebase.description}
                </p>
              )}
            </div>
            <Badge variant="default" className={status.className}>
              <StatusIcon
                size={12}
                className={
                  codebase.status === "syncing" ? "animate-spin mr-1" : "mr-1"
                }
              />
              {status.label}
            </Badge>
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <IconGitBranch size={14} />
              {codebase.defaultBranch}
            </span>
            {codebase.language && <span>{codebase.language}</span>}
            {codebase.totalFiles > 0 && (
              <span>{codebase.totalFiles} files</span>
            )}
          </div>

          {codebase.status === "syncing" && codebase.totalFiles > 0 && (
            <div className="mt-3">
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
