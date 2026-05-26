"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconBuilding, IconPlus } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { CreateTeamDialog } from "./_components/CreateTeamDialog";

export const Route = createFileRoute("/_main/teams/")({
  component: TeamsIndexPage,
});

function TeamsIndexPage() {
  const navigate = useNavigate();
  const teams = useQuery(api.teams.list);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!teams || teams.length === 0) return;
    void navigate({
      to: "/teams/$teamId/overview",
      params: { teamId: teams[0].team._id },
      replace: true,
    });
  }, [teams, navigate]);

  if (teams === undefined) {
    return (
      <PageContainer title="Teams" centeredMaxWidth>
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
        </div>
      </PageContainer>
    );
  }

  if (teams.length > 0) {
    return null;
  }

  return (
    <PageContainer
      title="Teams"
      centeredMaxWidth
      rightSection={
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <IconPlus size={16} />
          Create team
        </Button>
      }
    >
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <IconBuilding size={40} className="mb-3 text-muted" />
        <p className="mb-4 text-sm text-muted">
          You&apos;re not in any teams yet. Create one or ask a teammate to add
          you.
        </p>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <IconPlus size={16} />
          Create team
        </Button>
      </div>

      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageContainer>
  );
}
