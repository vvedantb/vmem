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

// profile fields needed by extension ui and service-worker
export type Profile = Pick<
  FunctionReturnType<typeof api.profiles.list>[number],
  "_id" | "name" | "color" | "icon" | "isDefault"
>;

// userSettings query shape from convex
export type ExtensionUserSettings = FunctionReturnType<
  typeof api.userSettings.get
>;
