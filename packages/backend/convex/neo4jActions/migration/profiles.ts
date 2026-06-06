"use node";

import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { deleteJunkSessionEdges as svcDeleteJunkSessionEdges } from "../../../src/neo4j/memory/dedup";
import {
  countMemoriesByProfile as svcCountMemoriesByProfile,
  countMemoriesWithoutProfile as svcCountMemoriesWithoutProfile,
  deleteMemoriesByProfile as svcDeleteMemoriesByProfile,
  migrateMemoriesToProfile,
  moveMemoriesBetweenProfiles as svcMoveMemoriesBetweenProfiles,
} from "../../../src/neo4j/memory/migration";
import { getDriver } from "../../../src/neo4j/driver";

interface MigrationResult {
  profileId: string;
  profileName: string;
  migratedCount: number;
}

export const migrateMemoriesToDefaultProfile = internalAction({
  args: { userId: v.id("users") },
  returns: v.object({
    profileId: v.string(),
    profileName: v.string(),
    migratedCount: v.number(),
  }),
  handler: async (ctx, args): Promise<MigrationResult> => {
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: args.userId,
    });
    if (!clerkId) {
      throw new Error("User not found");
    }

    const defaultProfile = await ctx.runMutation(
      internal.profiles.getOrCreateDefaultByClerkIdInternal,
      { clerkId },
    );

    const driver = getDriver();
    const migrated = await migrateMemoriesToProfile(
      driver,
      clerkId,
      defaultProfile._id,
    );

    return {
      profileId: defaultProfile._id,
      profileName: defaultProfile.name,
      migratedCount: migrated,
    };
  },
});

export const countMemoriesWithoutProfile = internalAction({
  args: { clerkId: v.string() },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await svcCountMemoriesWithoutProfile(driver, args.clerkId);
  },
});

export const countMemoriesByProfile = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await svcCountMemoriesByProfile(
      driver,
      args.clerkId,
      args.profileId,
    );
  },
});

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

export const deleteJunkSessionEdges = internalAction({
  args: { clerkId: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const deleted = await svcDeleteJunkSessionEdges(driver, args.clerkId);
    console.log(
      `deleteJunkSessionEdges: removed ${deleted} edges for ${args.clerkId}`,
    );
    return { deleted };
  },
});
