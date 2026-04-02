"use client";

import Link from "next/link";
import { Badge, Card, CardContent } from "@vmem/ui";
import {
  IconDatabase,
  IconGitBranch,
  IconLoader2,
  IconAlertTriangle,
  IconCheck,
} from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { mockCodebases } from "@/lib/mock-codebases";

const statusConfig = {
  indexed: {
    label: "Indexed",
    variant: "default" as const,
    icon: IconCheck,
    className:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10",
  },
  indexing: {
    label: "Indexing...",
    variant: "default" as const,
    icon: IconLoader2,
    className:
      "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/10",
  },
  error: {
    label: "Error",
    variant: "destructive" as const,
    icon: IconAlertTriangle,
    className: "",
  },
};

export default function CodebasesPage() {
  return (
    <PageContainer title="Codebases">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mockCodebases.map((codebase) => {
          const status = statusConfig[codebase.status];
          const StatusIcon = status.icon;
          const progress =
            codebase.totalFiles > 0
              ? Math.round((codebase.filesIndexed / codebase.totalFiles) * 100)
              : 0;

          return (
            <Link key={codebase.id} href={`/codebases/${codebase.id}`}>
              <Card className="border border-border bg-muted/50 shadow-none hover:bg-muted/80 transition-colors cursor-pointer">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <IconDatabase size={20} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-foreground truncate">
                          {codebase.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                          {codebase.description}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={status.variant}
                      className={status.className}
                    >
                      <StatusIcon
                        size={12}
                        className={
                          codebase.status === "indexing"
                            ? "animate-spin mr-1"
                            : "mr-1"
                        }
                      />
                      {status.label}
                    </Badge>
                  </div>

                  <div className="mt-3 sm:mt-4 flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <IconGitBranch size={14} />
                      {codebase.branch}
                    </span>
                    <span>{codebase.language}</span>
                    <span>
                      {codebase.filesIndexed}/{codebase.totalFiles} files
                    </span>
                  </div>

                  {codebase.status === "indexing" && (
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
        })}
      </div>
    </PageContainer>
  );
}
