"use client";

import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { IconLoader2 } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { TeamDetailProvider } from "@/components/teams/team-context";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { TeamTabs } from "./-components/TeamTabs";

/**
 * Team area of a team workspace (members / team settings). Personal
 * workspaces have no team — they get bounced to the workspace home.
 * Knowledge and overview have no equivalent here: the workspace's
 * memories and home pages already are them.
 */
export const Route = createFileRoute("/_main/$profileId/team")({
  component: TeamWorkspaceLayout,
});

function TeamWorkspaceLayout() {
  const profile = useActiveProfile();
  const navigate = useNavigate();
  const teamId = profile.teamId;

  const data = useQuery(
    api.teams.get,
    teamId !== undefined ? { teamId } : "skip",
  );

  useEffect(() => {
    if (teamId === undefined) {
      void navigate({
        to: "/$profileId/home",
        params: { profileId: profile._id },
        replace: true,
      });
    }
  }, [teamId, navigate, profile._id]);

  if (teamId === undefined || data === null) {
    // Not a team workspace (or membership just got revoked) — the effect
    // above redirects; render nothing meanwhile.
    return null;
  }

  if (data === undefined) {
    return (
      <PageContainer title="Team" centeredMaxWidth>
        <div className="flex items-center justify-center py-20">
          <IconLoader2 size={20} className="animate-spin text-muted" />
        </div>
      </PageContainer>
    );
  }

  return (
    <TeamDetailProvider value={data}>
      <PageContainer
        title={data.team.name}
        showTitle={false}
        centeredMaxWidth
        leftSection={<TeamTabs isOwner={data.role === "owner"} />}
      >
        <Outlet />
      </PageContainer>
    </TeamDetailProvider>
  );
}
