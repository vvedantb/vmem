import type { api } from "@vmem/backend";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

export type MemoryWithTags = FunctionReturnType<
  typeof api.memoryApi.createMemory
>;

export type MemoryCandidate = FunctionReturnType<
  typeof api.memoryApi.retrieveMemories
>["memories"][number];

export type CreateMemoryParams = FunctionArgs<
  typeof api.memoryApi.createMemory
>;

export type Profile = Pick<
  FunctionReturnType<typeof api.profiles.list>[number],
  "_id" | "name" | "color" | "icon" | "isDefault"
>;
