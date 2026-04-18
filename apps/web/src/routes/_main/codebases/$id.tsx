import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import { Button, Badge } from "@vmem/ui";
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

/** Status badge display config keyed by codebase sync status */
const statusConfig = {
  pending: {
    label: "Pending",
    icon: IconClock,
    className: "bg-muted text-muted-foreground border-border",
  },
  syncing: {
    label: "Syncing...",
    icon: IconLoader2,
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  synced: {
    label: "Synced",
    icon: IconCheck,
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  error: {
    label: "Error",
    icon: IconAlertTriangle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

export const Route = createFileRoute("/_main/codebases/$id")({
  component: CodebaseDetailPage,
});

function CodebaseDetailPage() {
  const { id } = Route.useParams();
  const codebase = useQuery(api.codebases.getById, { id });
  const syncCodebase = useAction(api.codebases.syncCodebase);
  const [syncing, setSyncing] = useState(false);

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

  // Loading state — query returns undefined while fetching
  if (codebase === undefined) {
    return (
      <PageContainer title="Codebase">
        <div className="flex items-center justify-center py-20">
          <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  // Not found — query resolved to null
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

  const status = statusConfig[codebase.status];
  const StatusIcon = status.icon;

  return (
    <PageContainer
      title={codebase.repoFullName}
      noScroll
      leftSection={
        <div className="flex items-center gap-3">
          <Link to="/codebases">
            <Button variant="outline" size="sm">
              <IconArrowLeft size={16} />
              Back
            </Button>
          </Link>
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
            {status.label}
          </Badge>
        </div>
      }
      rightSection={
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
      }
    >
      <CodebaseGraph codebaseId={id} />
    </PageContainer>
  );
}
