"use client";

import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { getTeamSectionLabel } from "@/components/teams/team-sidebar-sections";
import { useActiveTeamSection } from "@/components/teams/use-active-team-section";
import { Breadcrumb, BreadcrumbLink, BreadcrumbPage, Button } from "@vmem/ui";
import { IconArrowLeft, IconLoader2 } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { TeamDetailProvider } from "./-team-context";

export const Route = createFileRoute("/_main/teams/$teamId")({
  component: TeamLayout,
});

function TeamLayout() {
  const { teamId } = Route.useParams();
  const data = useQuery(api.teams.get, { teamId });
  const activeSection = useActiveTeamSection();
  const sectionLabel = getTeamSectionLabel(activeSection ?? "overview");

  if (data === undefined) {
    return (
      <PageContainer title="Team">
        <div className="flex items-center justify-center py-20">
          <IconLoader2
            size={20}
            className="animate-spin text-muted-foreground"
          />
        </div>
      </PageContainer>
    );
  }

  if (data === null) {
    return (
      <PageContainer title="Team">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Team not found or you&apos;re not a member.
          </p>
          <Link to="/teams">
            <Button variant="outline" size="sm">
              <IconArrowLeft size={16} />
              Back to teams
            </Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <TeamDetailProvider value={data}>
      <PageContainer
        title={`${data.team.name} / ${sectionLabel}`}
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbLink asChild>
              <Link
                to="/teams/$teamId/overview"
                params={{ teamId: data.team._id }}
              >
                {data.team.name}
              </Link>
            </BreadcrumbLink>
            <BreadcrumbPage>{sectionLabel}</BreadcrumbPage>
          </Breadcrumb>
        }
      >
        <Outlet />
      </PageContainer>
    </TeamDetailProvider>
  );
}
