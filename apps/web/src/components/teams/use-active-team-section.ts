"use client";

import { useMatchRoute, useParams } from "@tanstack/react-router";
import type { TeamSectionId } from "./team-sidebar-sections";

export function useActiveTeamSection(): TeamSectionId | null {
  const matchRoute = useMatchRoute();
  const params = useParams({ strict: false });
  if (typeof params.teamId !== "string") return null;
  if (matchRoute({ to: "/teams/$teamId/knowledge" })) return "knowledge";
  if (matchRoute({ to: "/teams/$teamId/members" })) return "members";
  if (matchRoute({ to: "/teams/$teamId/settings" })) return "settings";
  return "overview";
}
