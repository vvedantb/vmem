"use client";

import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import { Button } from "@vmem/ui";
import { IconDatabase, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { ConnectGitHubButton } from "./_components/ConnectGitHubButton";
import { AddRepoModal } from "./_components/AddRepoModal";
import { CodebaseCard } from "./_components/CodebaseCard";

export default function CodebasesPage() {
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
          <IconDatabase size={40} className="text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            {isConnected
              ? "No repositories synced yet. Add one to get started."
              : "Connect your GitHub account to start syncing repositories."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
