import { v } from "convex/values";

export const memoryTypeValidator = v.union(
  v.literal("fact"),
  v.literal("preference"),
  v.literal("experience"),
  v.literal("instruction"),
  v.literal("context"),
);

export const memorySourceValidator = v.union(
  v.literal("chat"),
  v.literal("api"),
  v.literal("mcp"),
  v.literal("manual"),
  v.literal("import"),
);

export const notificationTypeValidator = v.union(
  v.literal("memory_created"),
  v.literal("api_key_created"),
  v.literal("connector_added"),
  v.literal("system"),
);

export const apiKeyStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked"),
);
