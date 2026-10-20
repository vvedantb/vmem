/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function testConvex() {
  const t = convexTest(schema, modules);
  registerAuditLog(t);
  return t;
}

function asUser(
  t: ReturnType<typeof convexTest>,
  subject: string,
  email: string,
) {
  return t.withIdentity({ subject, email, name: email });
}

async function seedMemory(
  t: ReturnType<typeof convexTest>,
  userId: string,
  profileId: string,
  memoryId: string,
) {
  await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
    memoryId,
    userId,
    profileId,
    title: `Memory ${memoryId}`,
    content: "Keep this",
    type: "knowledge",
    source: "test",
    tags: [],
    confidence: 1,
  });
}

async function memoryIdsIn(
  t: ReturnType<typeof convexTest>,
  userId: string,
  profileId: string,
): Promise<string[]> {
  const listed = await t.query(
    internal.memoryStore.functions.listMemoriesInternal,
    { userId, profileId, limit: 50, offset: 0 },
  );
  return listed.memories.map((memory) => memory.id);
}

async function setup() {
  const t = testConvex();
  const owner = asUser(t, "clerk_profile_owner", "owner@example.com");
  const other = asUser(t, "clerk_profile_other", "other@example.com");
  await owner.mutation(api.auth.ensureUserExists, {});
  await other.mutation(api.auth.ensureUserExists, {});

  const ownerDefault = await owner.mutation(
    api.profiles.getOrCreateDefault,
    {},
  );
  const ownerWork = await owner.mutation(api.profiles.create, {
    name: "Work",
    color: "blue",
    icon: "briefcase",
  });
  const otherDefault = await other.mutation(
    api.profiles.getOrCreateDefault,
    {},
  );
  const otherSide = await other.mutation(api.profiles.create, {
    name: "Side",
    color: "green",
    icon: "star",
  });
  if (!ownerWork || !otherSide) throw new Error("profile create failed");

  await seedMemory(t, "clerk_profile_owner", ownerDefault._id, "owner_default");
  await seedMemory(t, "clerk_profile_owner", ownerWork._id, "owner_work");
  await seedMemory(t, "clerk_profile_other", otherSide._id, "other_side");

  return { t, owner, other, ownerDefault, ownerWork, otherDefault, otherSide };
}

describe("profiles.removeWithMemories ownership", () => {
  it("refuses another user's profile and leaves its memories alone", async () => {
    const { t, other, ownerWork } = await setup();

    await expect(
      other.action(api.profiles.removeWithMemories, {
        profileId: ownerWork._id,
      }),
    ).rejects.toThrow(/Profile not found/);

    expect(await memoryIdsIn(t, "clerk_profile_owner", ownerWork._id)).toEqual([
      "owner_work",
    ]);
  });

  it("refuses to move memories into a profile the caller does not own", async () => {
    const { t, owner, ownerWork, otherSide } = await setup();

    await expect(
      owner.action(api.profiles.removeWithMemories, {
        profileId: ownerWork._id,
        moveMemoriesToProfileId: otherSide._id,
      }),
    ).rejects.toThrow(/Target profile not found/);

    expect(await memoryIdsIn(t, "clerk_profile_owner", ownerWork._id)).toEqual([
      "owner_work",
    ]);
    expect(await memoryIdsIn(t, "clerk_profile_other", otherSide._id)).toEqual([
      "other_side",
    ]);
  });

  it("refuses to delete a default profile before touching its memories", async () => {
    const { t, owner, other, ownerDefault, otherDefault } = await setup();

    await expect(
      owner.action(api.profiles.removeWithMemories, {
        profileId: ownerDefault._id,
      }),
    ).rejects.toThrow(/Cannot delete the default profile/);
    await expect(
      owner.action(api.profiles.removeWithMemories, {
        profileId: otherDefault._id,
      }),
    ).rejects.toThrow(/Profile not found/);
    await expect(
      other.action(api.profiles.removeWithMemories, {
        profileId: ownerDefault._id,
      }),
    ).rejects.toThrow(/Profile not found/);

    expect(
      await memoryIdsIn(t, "clerk_profile_owner", ownerDefault._id),
    ).toEqual(["owner_default"]);
  });

  it("still lets the owner move memories and delete their own profile", async () => {
    const { t, owner, ownerDefault, ownerWork } = await setup();

    await owner.action(api.profiles.removeWithMemories, {
      profileId: ownerWork._id,
      moveMemoriesToProfileId: ownerDefault._id,
    });

    const moved = await memoryIdsIn(t, "clerk_profile_owner", ownerDefault._id);
    expect(moved.sort()).toEqual(["owner_default", "owner_work"]);
    const profiles = await owner.query(api.profiles.list, {});
    expect(profiles.some((profile) => profile._id === ownerWork._id)).toBe(
      false,
    );
  });
});
