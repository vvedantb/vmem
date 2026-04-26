import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import {
  Badge,
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbPage,
  Button,
} from "@vmem/ui";
import {
  IconArrowLeft,
  IconGitBranch,
  IconRefresh,
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconClock,
  IconDatabase,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { CodebaseGraph } from "@/components/codebases/CodebaseGraph";
import CodebaseGraphHeaderControls from "@/components/codebases/CodebaseGraphHeaderControls";
import { useCodebaseGraphController } from "@/hooks/useCodebaseGraphController";
import { useCodebaseOverview } from "@/hooks/useCodebaseGraphData";
import { VmemSpinner } from "@/components/svg-animations";

/** Status badge display config keyed by codebase sync status. */
const statusConfig = {
  pending: {
    label: "Pending",
    icon: IconClock,
    className: "bg-muted text-muted-foreground",
  },
  syncing: {
    label: "Syncing...",
    icon: IconLoader2,
    className: "bg-blue-500/10 text-blue-600",
  },
  synced: {
    label: "Synced",
    icon: IconCheck,
    className: "bg-emerald-500/10 text-emerald-600",
  },
  error: {
    label: "Error",
    icon: IconAlertTriangle,
    className: "bg-destructive/10 text-destructive",
  },
};

/** Friendly labels for the live `parseStage` mid-sync indicator. */
const PARSE_STAGE_LABEL: Record<string, string> = {
  fetching: "Fetching files…",
  parsing: "Parsing source…",
  processes: "Detecting processes…",
  writing: "Writing to graph…",
  done: "Sync complete",
};

export const Route = createFileRoute("/_main/codebases/$id")({
  component: CodebaseDetailPage,
});

function CodebaseDetailPage() {
  const { id } = Route.useParams();
  const codebase = useQuery(api.codebases.getById, { id });

  // Loading state — query returns undefined while fetching.
  if (codebase === undefined) {
    return (
      <PageContainer title="Codebase">
        <div className="flex items-center justify-center py-20">
          <VmemSpinner size={24} className="text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  // Not found — query resolved to null.
  if (codebase === null) {
    return (
      <PageContainer title="Codebase Not Found">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <IconDatabase size={40} className="mb-3 text-muted-foreground" />
          <p className="mb-2 font-medium text-foreground">Codebase not found</p>
          <p className="mb-4 text-sm text-muted-foreground">
            The codebase you are looking for does not exist or has been removed.
          </p>
          <Link to="/codebases">
            <Button variant="outline">
              <IconArrowLeft size={16} />
              Back to Codebases
            </Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  return <CodebaseDetailView id={id} codebase={codebase} />;
}

type Codebase = NonNullable<FunctionReturnType<typeof api.codebases.getById>>;

function CodebaseDetailView({
  id,
  codebase,
}: {
  id: string;
  codebase: Codebase;
}) {
  const syncCodebase = useAction(api.codebases.syncCodebase);
  const [syncing, setSyncing] = useState(false);
  const controller = useCodebaseGraphController(id);
  const { stats } = useCodebaseOverview(id);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncCodebase({ id });
      toast.success("Sync started");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  }, [id, syncCodebase]);

  const status = statusConfig[codebase.status];
  const StatusIcon = status.icon;

  // Mid-sync stage label trumps the static status when set so the user sees
  // live progress through the parser pipeline.
  const liveStatusLabel =
    codebase.status === "syncing" && codebase.parseStage
      ? (PARSE_STAGE_LABEL[codebase.parseStage] ?? status.label)
      : status.label;

  // Stat line displayed in the page header. Falls back to the persisted
  // counts on the codebases row when the live overview hasn't loaded yet so
  // the chrome doesn't flash empty values during navigation. The legacy
  // codebase row stores file count as `syncedFiles` (Phase 0); Phase 1
  // stats (`functionCount` / `classCount` / `processCount`) live on the
  // overview query and on the row as new optional fields.
  const fileCount = stats?.fileCount ?? codebase.syncedFiles ?? 0;
  const fnCount = stats?.functionCount ?? codebase.functionCount ?? 0;
  const classCount = stats?.classCount ?? codebase.classCount ?? 0;
  const processCount = stats?.processCount ?? codebase.processCount ?? 0;

  return (
    <PageContainer
      title={codebase.repoFullName}
      noScroll
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbLink asChild>
            <Link to="/codebases">Codebases</Link>
          </BreadcrumbLink>
          <BreadcrumbPage>{codebase.repoFullName}</BreadcrumbPage>
        </Breadcrumb>
      }
      centerSection={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconGitBranch size={14} />
            <span>{codebase.defaultBranch}</span>
          </div>
          <Badge variant="default" className={status.className}>
            <StatusIcon
              size={12}
              className={
                codebase.status === "syncing" ? "mr-1 animate-spin" : "mr-1"
              }
            />
            {liveStatusLabel}
          </Badge>
          <div className="hidden lg:flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
            <span title="Files">{fileCount} files</span>
            <span aria-hidden="true">·</span>
            <span title="Functions">{fnCount} fns</span>
            <span aria-hidden="true">·</span>
            <span title="Classes">{classCount} classes</span>
            <span aria-hidden="true">·</span>
            <span title="Processes">{processCount} processes</span>
          </div>
        </div>
      }
      rightSection={
        <div className="flex items-center gap-1.5">
          <CodebaseGraphHeaderControls controller={controller} />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing || codebase.status === "syncing"}
          >
            {syncing ? (
              <IconLoader2 size={16} className="animate-spin" />
            ) : (
              <IconRefresh size={16} />
            )}
            {syncing ? "Syncing..." : "Sync"}
          </Button>
        </div>
      }
    >
      <CodebaseGraph codebaseId={id} controller={controller} />
    </PageContainer>
  );
}
