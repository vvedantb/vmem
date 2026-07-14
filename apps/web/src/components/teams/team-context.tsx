import { createContext, use, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";

export type TeamDetail = NonNullable<FunctionReturnType<typeof api.teams.get>>;

type TeamWorkspaceState = {
  detail: TeamDetail;
};

type TeamWorkspaceMeta = {
  isOwner: boolean;
};

export type TeamWorkspaceContextValue = {
  state: TeamWorkspaceState;
  meta: TeamWorkspaceMeta;
};

const TeamWorkspaceContext = createContext<TeamWorkspaceContextValue | null>(
  null,
);

export function TeamDetailProvider({
  detail,
  children,
}: {
  detail: TeamDetail;
  children: ReactNode;
}) {
  const value: TeamWorkspaceContextValue = {
    state: { detail },
    meta: { isOwner: detail.role === "owner" },
  };

  return (
    <TeamWorkspaceContext.Provider value={value}>
      {children}
    </TeamWorkspaceContext.Provider>
  );
}

export function useTeamWorkspace(): TeamWorkspaceContextValue {
  const value = use(TeamWorkspaceContext);
  if (value === null) {
    throw new Error("useTeamWorkspace must be used within TeamDetailProvider");
  }
  return value;
}

export function useTeamDetail(): TeamDetail {
  return useTeamWorkspace().state.detail;
}
