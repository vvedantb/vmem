import type { FunctionReturnType } from "convex/server";
import type { Doc } from "@vmem/backend";
import { api } from "@vmem/backend";

export type ProfileListItem = FunctionReturnType<
  typeof api.profiles.list
>[number];

export type AiLogRow = Doc<"openRouterLogs">;
