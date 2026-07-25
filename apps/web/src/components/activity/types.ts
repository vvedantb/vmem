import type { FunctionReturnType } from "convex/server";
import type { Doc, api } from "@vmem/backend";

export type ProfileListItem = FunctionReturnType<
  typeof api.profiles.list
>[number];

export type TeamListItem = FunctionReturnType<typeof api.teams.list>[number];

export type ActivityItem = FunctionReturnType<
  typeof api.dashboardApi.getRecentActivity
>[number];

export type AiLogRow = Doc<"openRouterLogs">;
