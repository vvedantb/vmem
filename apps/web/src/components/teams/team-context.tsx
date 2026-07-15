import { createContext, use, type ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@vmem/backend";

export type TeamDetail = NonNullable<FunctionReturnType<typeof api.teams.get>>;
export type TeamMember = TeamDetail["members"][number];

type TeamWorkspaceContextValue = {
  detail: TeamDetail;
  meta: { isOwner: boolean };
};

const TeamIdContext = createContext<Id<"teams"> | null>(null);

export function TeamDetailProvider({
  teamId,
  children,
}: {
  teamId: Id<"teams">;
  children: ReactNode;
}) {
  return (
    <TeamIdContext.Provider value={teamId}>{children}</TeamIdContext.Provider>
  );
}

export function useTeamWorkspace(): TeamWorkspaceContextValue {
  const teamId = use(TeamIdContext);
  if (teamId === null) {
    throw new Error("useTeamWorkspace must be used within TeamDetailProvider");
  }
  const detail = useQuery(api.teams.get, { teamId });
  if (detail === undefined) {
    throw new Error("Team detail is loading");
  }
  if (detail === null) {
    throw new Error("Team not found");
  }
  return {
    detail,
    meta: { isOwner: detail.role === "owner" },
  };
}

export function useTeamDetail(): TeamDetail {
  return useTeamWorkspace().detail;
}
