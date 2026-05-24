import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import { Breadcrumb, BreadcrumbPage, Button } from "@vmem/ui";
import {
  IconArrowLeft,
  IconRefresh,
  IconLoader2,
  IconDatabase,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { CodebaseGraph } from "@/components/codebases/CodebaseGraph";
import CodebaseGraphHeaderControls from "@/components/codebases/CodebaseGraphHeaderControls";
import { useCodebaseGraphController } from "@/hooks/useCodebaseGraphController";
import { VmemSpinner } from "@/components/svg-animations";

export const Route = createFileRoute("/_main/codebases/$id")({
  component: CodebaseDetailPage,
});

function CodebaseDetailPage() {
  const { id } = Route.useParams();
  const codebase = useQuery(api.codebases.getById, { id });

  if (codebase === undefined) {
    return (
      <PageContainer title="Codebase">
        <div className="flex items-center justify-center py-20">
          <VmemSpinner size={24} className="text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

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

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncCodebase({ id });
      toast.success(`${codebase.repoName} synced`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  }, [id, syncCodebase, codebase.repoName]);

  return (
    <PageContainer
      title={codebase.repoFullName}
      noScroll
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbPage>{codebase.repoFullName}</BreadcrumbPage>
        </Breadcrumb>
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
