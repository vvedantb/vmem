"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

interface MigrationResult {
  profileId: string;
  profileName: string;
  migratedCount: number;
}

/**
 * Migrate all memories without profileId to the user's default profile.
 * Used for existing users when the profiles feature is introduced.
 */
export const migrateMemoriesToDefaultProfile = internalAction({
  args: { userId: v.id("users") },
  returns: v.object({
    profileId: v.string(),
    profileName: v.string(),
    migratedCount: v.number(),
  }),
  handler: async (ctx, args): Promise<MigrationResult> => {
    // Get the user's Clerk ID
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: args.userId,
    });
    if (!clerkId) {
      throw new Error("User not found");
    }

    // Get or create default profile
    const defaultProfile = await ctx.runMutation(
      internal.profiles.getOrCreateDefaultByClerkIdInternal,
      { clerkId },
    );

    // Migrate memories
    const service = new MemoryService(getDriver());
    const migrated = await service.migrateMemoriesToProfile(
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

/**
 * Count memories without profileId for a user.
 */
export const countMemoriesWithoutProfile = internalAction({
  args: { clerkId: v.string() },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.countMemoriesWithoutProfile(args.clerkId);
  },
});

/**
 * Count memories for a specific profile.
 */
export const countMemoriesByProfile = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.countMemoriesByProfile(args.clerkId, args.profileId);
  },
});

/**
 * Move memories from one profile to another (used when deleting a profile).
 */
export const moveMemoriesBetweenProfiles = internalAction({
  args: {
    clerkId: v.string(),
    fromProfileId: v.string(),
    toProfileId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.moveMemoriesBetweenProfiles(
      args.clerkId,
      args.fromProfileId,
      args.toProfileId,
    );
  },
});

/**
 * Delete all memories for a profile (used when deleting a profile without migration).
 */
export const deleteMemoriesByProfile = internalAction({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.deleteMemoriesByProfile(args.clerkId, args.profileId);
  },
});
