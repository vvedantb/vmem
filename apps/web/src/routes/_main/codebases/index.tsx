import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useAction } from "convex/react";
import { api, PARSER_VERSION } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import { Button } from "@vmem/ui";
import {
  IconAlertCircle,
  IconDatabase,
  IconPlus,
  IconRefresh,
  IconLoader2,
} from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { AddRepoModal } from "@/components/codebases/AddRepoModal";
import { CodebaseCard } from "@/components/codebases/CodebaseCard";
import { toast } from "sonner";

export const Route = createFileRoute("/_main/codebases/")({
  component: CodebasesPage,
});

function CodebasesPage() {
  const connection = useQuery(api.github.getConnection);
  const codebases = useQuery(api.codebases.listMy);
  const syncAllMy = useAction(api.codebases.syncAllMy);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const isConnected = connection !== undefined && connection !== null;

  // A codebase is stale when its row was written by an older parser version.
  // We compare against the bundled `PARSER_VERSION` constant so a deploy that
  // bumps the version automatically lights up the banner without any
  // server-side migration step.
  const staleCodebases = (codebases ?? []).filter(
    (cb) =>
      cb.status === "synced" &&
      (cb.parserVersion === undefined || cb.parserVersion !== PARSER_VERSION),
  );
  const showResyncBanner = staleCodebases.length > 0;

  const handleResyncAll = useCallback(async () => {
    setResyncing(true);
    try {
      const result = await syncAllMy({});
      toast.success(`Re-syncing ${result.synced} codebase(s)`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start re-sync";
      toast.error(message);
    } finally {
      setResyncing(false);
    }
  }, [syncAllMy]);

  return (
    <PageContainer
      title="Codebases"
      rightSection={
        isConnected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddModalOpen(true)}
          >
            <IconPlus size={16} />
            Add Repository
          </Button>
        ) : undefined
      }
    >
      {showResyncBanner && (
        <div className="mb-4 flex items-start gap-3 rounded-lg bg-amber-500/10 p-3">
          <IconAlertCircle
            size={18}
            className="mt-0.5 flex-shrink-0 text-amber-600"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Parser updated to {PARSER_VERSION}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {staleCodebases.length} codebase
              {staleCodebases.length === 1 ? "" : "s"} ha
              {staleCodebases.length === 1 ? "s" : "ve"} been parsed by an older
              version. Re-sync to pick up new node kinds, edges, and processes.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResyncAll}
            disabled={resyncing}
          >
            {resyncing ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : (
              <IconRefresh size={14} />
            )}
            {resyncing ? "Starting…" : "Re-sync all"}
          </Button>
        </div>
      )}

      {codebases === undefined ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : codebases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <IconDatabase size={40} className="mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isConnected ? (
              "No repositories synced yet. Add one to get started."
            ) : (
              <>
                Connect GitHub in{" "}
                <Link
                  to="/settings/connectors"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Settings → Connectors
                </Link>{" "}
                to sync repositories.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {codebases.map((codebase) => (
            <CodebaseCard key={codebase._id} codebase={codebase} />
          ))}
        </div>
      )}

      {isConnected && connection && (
        <AddRepoModal
          open={addModalOpen}
          onOpenChange={setAddModalOpen}
          connectionId={connection.id}
        />
      )}
    </PageContainer>
  );
}
