"use client";

import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { motion } from "motion/react";
import { api } from "@vmem/backend";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import { IconBuilding, IconPlus } from "@tabler/icons-react";
import { TeamSidebarGroup } from "@/components/teams/TeamSidebarGroup";
import { useActiveTeamSection } from "@/components/teams/use-active-team-section";
import { TeamsSearchBar } from "@/components/teams/TeamsSearchBar";
import { CreateTeamDialog } from "@/routes/_main/teams/_components/CreateTeamDialog";
import { teamsSearchParams } from "@/routes/_main/teams/-searchParams";

export type TeamsSidebarNavProps = {
  isIconOnly: boolean;
  isMobile: boolean;
};

export function TeamsSidebarNav({
  isIconOnly,
  isMobile,
}: TeamsSidebarNavProps) {
  const params = useParams({ strict: false });
  const teamId = typeof params.teamId === "string" ? params.teamId : undefined;
  const activeSection = useActiveTeamSection();

  const teams = useQuery(api.teams.list);
  const [{ q: searchQuery }, setSearchParams] =
    useQueryStates(teamsSearchParams);
  const [createOpen, setCreateOpen] = useState(false);

  const filteredTeams = useMemo(() => {
    if (!teams) return [];
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) return teams;
    return teams.filter(
      (entry) =>
        entry.team.name.toLowerCase().includes(query) ||
        entry.role.toLowerCase().includes(query),
    );
  }, [teams, searchQuery]);

  return (
    <motion.nav
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin px-1">
        {teams === undefined ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
          </div>
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
            <IconBuilding size={28} className="mb-2 text-muted" />
            {!isIconOnly ? (
              <p className="text-xs text-muted">No teams yet</p>
            ) : null}
          </div>
        ) : (
          <>
            {!isIconOnly ? (
              <TeamsSearchBar
                value={searchQuery}
                onChange={(value) => {
                  void setSearchParams({ q: value });
                }}
              />
            ) : null}
            {filteredTeams.length === 0 ? (
              !isIconOnly ? (
                <p className="px-2 py-4 text-center text-xs text-muted">
                  No teams match your search.
                </p>
              ) : null
            ) : (
              <div className="flex flex-col gap-1">
                {filteredTeams.map((entry) => (
                  <TeamSidebarGroup
                    key={entry.team._id}
                    entry={entry}
                    isSelected={teamId === entry.team._id}
                    isIconOnly={isIconOnly}
                    activeSection={
                      teamId === entry.team._id ? activeSection : null
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!isIconOnly ? (
        <div className="shrink-0 px-1 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <IconPlus size={16} />
            Create team
          </Button>
        </div>
      ) : null}

      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </motion.nav>
  );
}
