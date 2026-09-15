import type { FunctionReturnType } from "convex/server";
import type { MemoryCandidate } from "@vmem/sdk";
import type { internal } from "../../_generated/api";

export type RetrieveHttpResult = {
  memories: MemoryCandidate[];
  userContext: FunctionReturnType<
    typeof internal.userSettings.getUserContextInternal
  >;
  summary?: string;
};
