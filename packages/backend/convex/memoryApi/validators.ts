import { v, type Infer } from "convex/values";
import { memoryStatusValidator, memoryTypeValidator } from "../validators";

export { memoryStatusValidator, memoryTypeValidator };
export const profileIdOptional = v.optional(v.string());

export const paginationFields = {
  limit: v.number(),
  offset: v.number(),
};

export const createMemoryFields = {
  title: v.string(),
  content: v.string(),
  type: memoryTypeValidator,
  source: v.string(),
  tags: v.array(v.string()),
  confidence: v.number(),
  expiresAt: v.optional(v.string()),
  url: v.optional(v.string()),
  profileId: profileIdOptional,
  externalId: v.optional(v.string()),
  sourceType: v.optional(v.string()),
};

export const listMemoriesFilterFields = {
  profileId: profileIdOptional,
  type: v.optional(v.string()),
  status: v.optional(v.string()),
  source: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  searchQuery: v.optional(v.string()),
};

export const listMemoriesFields = {
  ...listMemoriesFilterFields,
  ...paginationFields,
};

export const searchMemoriesFilterFields = {
  profileId: profileIdOptional,
  query: v.optional(v.string()),
  type: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  source: v.optional(v.string()),
};

export const searchMemoriesFields = {
  ...searchMemoriesFilterFields,
  ...paginationFields,
};

export const updateMemoryContentFields = {
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  type: v.optional(memoryTypeValidator),
  status: v.optional(memoryStatusValidator),
  tags: v.optional(v.array(v.string())),
  confidence: v.optional(v.number()),
  expiresAt: v.optional(v.union(v.string(), v.null())),
};

export const updateMemoryFields = {
  memoryId: v.string(),
  profileId: profileIdOptional,
  ...updateMemoryContentFields,
};

export const updateMemoryInternalFields = {
  clerkId: v.string(),
  memoryId: v.string(),
  ...updateMemoryContentFields,
};

export const teamListMemoriesFields = {
  profileId: v.string(),
  type: v.optional(v.string()),
  status: v.optional(v.string()),
  source: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  searchQuery: v.optional(v.string()),
  ...paginationFields,
};

export const updateMemoryInternalArgs = v.object(updateMemoryInternalFields);
export type UpdateMemoryInternalArgs = Infer<typeof updateMemoryInternalArgs>;

export const teamListMemoriesArgs = v.object(teamListMemoriesFields);
export type TeamListMemoriesArgs = Infer<typeof teamListMemoriesArgs>;
