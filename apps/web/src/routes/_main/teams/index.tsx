import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconBuilding, IconPlus, IconUsers } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { CreateTeamDialog } from "./_components/CreateTeamDialog";

export const Route = createFileRoute("/_main/teams/")({
  component: TeamsPage,
});

type TeamListItem = FunctionReturnType<typeof api.teams.list>[number];

function TeamsPage() {
  const teams = useQuery(api.teams.list);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <PageContainer
      title="Teams"
      rightSection={
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <IconPlus size={16} />
          Create team
        </Button>
      }
    >
      {teams === undefined ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : teams.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((entry) => (
            <TeamCard key={entry.team._id} entry={entry} />
          ))}
        </div>
      )}

      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageContainer>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <IconBuilding size={40} className="mb-3 text-muted-foreground" />
      <p className="mb-4 text-sm text-muted-foreground">
        You&apos;re not in any teams yet. Create one or ask a teammate to add
        you.
      </p>
      <Button variant="outline" size="sm" onClick={onCreate}>
        <IconPlus size={16} />
        Create team
      </Button>
    </div>
  );
}

function TeamCard({ entry }: { entry: TeamListItem }) {
  const { team, role, profile, memberCount } = entry;
  return (
    <Link
      to="/teams/$teamId/overview"
      params={{ teamId: team._id }}
      className="group flex flex-col gap-3 rounded-lg bg-muted/40 p-4 transition-[background-color] hover:bg-muted/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center"
            style={{
              backgroundColor: profile?.color
                ? `${profile.color}22`
                : undefined,
            }}
          >
            <IconBuilding
              size={18}
              style={{ color: profile?.color }}
              className="text-muted-foreground"
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {team.name}
            </div>
            <div className="text-xs text-muted-foreground capitalize">
              {role}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <IconUsers size={14} />
        <span>
          {memberCount} {memberCount === 1 ? "member" : "members"}
        </span>
      </div>
    </Link>
  );
}
