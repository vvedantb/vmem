"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import {
  deleteMemoriesByProfile as svcDeleteMemoriesByProfile,
  moveMemoriesBetweenProfiles as svcMoveMemoriesBetweenProfiles,
} from "../../../engine/neo4j/memory/migration";
import { getDriver } from "../../../engine/neo4j/driver";

export const moveMemoriesBetweenProfiles = internalAction({
  args: {
    clerkId: v.string(),
    fromProfileId: v.string(),
    toProfileId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await svcMoveMemoriesBetweenProfiles(
      driver,
      args.clerkId,
      args.fromProfileId,
      args.toProfileId,
    );
  },
});

export const deleteMemoriesByProfile = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await svcDeleteMemoriesByProfile(
      driver,
      args.clerkId,
      args.profileId,
    );
  },
});
