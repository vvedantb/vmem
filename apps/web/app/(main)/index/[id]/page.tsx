"use client";

import { use } from "react";
import Link from "next/link";
import { Badge, Card, CardContent, Button } from "@vmem/ui";
import {
  IconArrowLeft,
  IconDatabase,
  IconGitBranch,
  IconFile,
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconExternalLink,
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

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CodebaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const codebase = mockCodebases.find((cb) => cb.id === id);

  if (!codebase) {
    return (
      <PageContainer title="Codebase Not Found">
        <Card className="border border-border bg-muted/50 shadow-none">
          <CardContent className="p-8 text-center">
            <IconDatabase
              size={48}
              className="text-muted-foreground mx-auto mb-4"
            />
            <p className="text-foreground font-medium mb-2">
              Codebase not found
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              The codebase you are looking for does not exist or has been
              removed.
            </p>
            <Link href="/index">
              <Button variant="outline">
                <IconArrowLeft size={16} />
                Back to Index
              </Button>
            </Link>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const status = statusConfig[codebase.status];
  const StatusIcon = status.icon;
  const progress =
    codebase.totalFiles > 0
      ? Math.round((codebase.filesIndexed / codebase.totalFiles) * 100)
      : 0;

  return (
    <PageContainer
      title={codebase.name}
      rightSection={
        <Link href="/index">
          <Button variant="outline" size="sm">
            <IconArrowLeft size={16} />
            Back
          </Button>
        </Link>
      }
    >
      <Card className="border border-border bg-muted/50 shadow-none">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <IconDatabase size={24} className="text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">
                  {codebase.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {codebase.description}
                </p>
              </div>
            </div>
            <Badge variant={status.variant} className={status.className}>
              <StatusIcon
                size={12}
                className={
                  codebase.status === "indexing" ? "animate-spin mr-1" : "mr-1"
                }
              />
              {status.label}
            </Badge>
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Language</p>
              <p className="text-sm font-medium text-foreground mt-1">
                {codebase.language}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Branch</p>
              <p className="text-sm font-medium text-foreground mt-1 flex items-center gap-1">
                <IconGitBranch size={14} />
                {codebase.branch}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Files Indexed</p>
              <p className="text-sm font-medium text-foreground mt-1">
                {codebase.filesIndexed} / {codebase.totalFiles}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Indexed</p>
              <p className="text-sm font-medium text-foreground mt-1">
                {formatDate(codebase.lastIndexed)}
              </p>
            </div>
          </div>

          {codebase.status === "indexing" && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Indexing progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <a
              href={codebase.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <IconExternalLink size={14} />
              View repository
            </a>
          </div>
        </CardContent>
      </Card>

      {codebase.files.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">
            Indexed Files ({codebase.files.length})
          </h3>
          <Card className="border border-border bg-muted/50 shadow-none overflow-hidden">
            <div className="divide-y divide-border">
              {codebase.files.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <IconFile
                      size={16}
                      className="text-muted-foreground shrink-0"
                    />
                    <span className="text-xs sm:text-sm text-foreground font-mono truncate">
                      {file.path}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 text-xs text-muted-foreground shrink-0">
                    <span className="hidden sm:inline">{file.language}</span>
                    <span>{file.size}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
