"use client";

import { createContext, use, type ReactNode } from "react";
import type { TeamDetail } from "./team-detail";

const TeamDetailContext = createContext<TeamDetail | null>(null);

export function TeamDetailProvider({
  value,
  children,
}: {
  value: TeamDetail;
  children: ReactNode;
}) {
  return (
    <TeamDetailContext.Provider value={value}>
      {children}
    </TeamDetailContext.Provider>
  );
}

export function useTeamDetail(): TeamDetail {
  const value = use(TeamDetailContext);
  if (value === null) {
    throw new Error("useTeamDetail must be used within TeamDetailProvider");
  }
  return value;
}
