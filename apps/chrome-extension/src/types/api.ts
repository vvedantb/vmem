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

// subset of profile fields the extension ui/sw need
export type Profile = Pick<
  FunctionReturnType<typeof api.profiles.list>[number],
  "_id" | "name" | "color" | "icon" | "isDefault"
>;

// live userSettings query shape single source of truth from convex
export type ExtensionUserSettings = FunctionReturnType<
  typeof api.userSettings.get
>;
