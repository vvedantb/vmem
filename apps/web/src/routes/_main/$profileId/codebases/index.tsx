"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconDatabase, IconPlus } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { AddRepoModal } from "@/components/codebases/AddRepoModal";
import { useActiveProfile } from "@/components/workspace/active-profile";

export const Route = createFileRoute("/_main/$profileId/codebases/")({
  component: CodebasesIndexPage,
});

function CodebasesIndexPage() {
  const { profileId } = Route.useParams();
  const teamId = useActiveProfile().teamId;
  const navigate = useNavigate();
  const connection = useQuery(api.github.getConnection);
  const codebases = useQuery(api.codebases.listMy, { teamId });
  const [addModalOpen, setAddModalOpen] = useState(false);

  const isConnected = connection !== undefined && connection !== null;

  useEffect(() => {
    const first = codebases?.at(0);
    if (!first) return;
    void navigate({
      to: "/$profileId/codebases/$id",
      params: { profileId, id: first._id },
      replace: true,
    });
  }, [codebases, navigate, profileId]);

  if (codebases === undefined) {
    return (
      <PageContainer title="Codebases">
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
        </div>
      </PageContainer>
    );
  }

  if (codebases.length > 0) {
    return null;
  }

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
            Add repository
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <IconDatabase size={40} className="mb-3 text-muted" />
        <p className="text-sm text-muted">
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
        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setAddModalOpen(true)}
          >
            <IconPlus size={16} />
            Add repository
          </Button>
        ) : null}
      </div>

      {isConnected && connection ? (
        <AddRepoModal
          open={addModalOpen}
          onOpenChange={setAddModalOpen}
          connectionId={connection.id}
        />
      ) : null}
    </PageContainer>
  );
}
