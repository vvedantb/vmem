import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import { Button } from "@vmem/ui";
import { IconDatabase, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { ConnectGitHubButton } from "@/components/codebases/ConnectGitHubButton";
import { AddRepoModal } from "@/components/codebases/AddRepoModal";
import { CodebaseCard } from "@/components/codebases/CodebaseCard";

export const Route = createFileRoute("/_main/codebases/")({
  component: CodebasesPage,
});

function CodebasesPage() {
  const connection = useQuery(api.github.getConnection);
  const codebases = useQuery(api.codebases.listMy);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const isConnected = connection !== undefined && connection !== null;

  return (
    <PageContainer
      title="Codebases"
      rightSection={
        <div className="flex items-center gap-2">
          {isConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddModalOpen(true)}
            >
              <IconPlus size={16} />
              Add Repository
            </Button>
          )}
          <ConnectGitHubButton connection={connection ?? null} />
        </div>
      }
    >
      {codebases === undefined ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : codebases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <IconDatabase size={40} className="mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isConnected
              ? "No repositories synced yet. Add one to get started."
              : "Connect your GitHub account to start syncing repositories."}
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
