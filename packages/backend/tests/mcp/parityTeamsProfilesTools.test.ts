import { describe, expect, it } from "vitest";
import { z } from "zod";
import { profilesToolSpecs } from "../../convex/mcp/toolsProfiles";
import { teamsToolSpecs } from "../../convex/mcp/toolsTeams";
import { createConvexBackend, mcpCaller, signUp } from "./convexHarness";

const ALICE = "clerk_teams_alice";
const BOB = "clerk_teams_bob";
const CAROL = "clerk_teams_carol";

const teamCreatedSchema = z.object({
  teamId: z.string(),
  profileId: z.string(),
});
const teamGetSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  role: z.enum(["owner", "member"]),
  members: z.array(
    z.object({
      userId: z.string(),
      email: z.string().nullable(),
      role: z.string(),
    }),
  ),
});
const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  icon: z.string(),
});
const memorySearchSchema = z.object({
  memories: z.array(z.object({ id: z.string() })),
});

describe("MCP teams parity tools (convex-test backend)", () => {
  it("team tools keep the web owner and membership checks", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    const bobUser = await signUp(t, BOB, "bob@example.com");
    await signUp(t, CAROL, "carol@example.com");
    const alice = mcpCaller(t, ALICE);
    const bob = mcpCaller(t, BOB);
    const carol = mcpCaller(t, CAROL);

    const { teamId } = teamCreatedSchema.parse(
      await alice.call("teams_create", { name: "Crew" }),
    );
    await alice.call("teams_add_member", { teamId, email: "bob@example.com" });
    await expect(
      bob.call("teams_add_member", { teamId, email: "carol@example.com" }),
    ).rejects.toThrow(/Requires role: owner/);

    expect(await alice.call("teams_list")).toEqual([
      expect.objectContaining({
        teamId,
        name: "Crew",
        role: "owner",
        memberCount: 2,
      }),
    ]);
    const viaTeamConnector = teamGetSchema.parse(
      await mcpCaller(t, BOB, "team").call("teams_get"),
    );
    expect(viaTeamConnector).toMatchObject({ teamId, role: "member" });
    expect(
      viaTeamConnector.members
        .flatMap((m) => m.email ?? [])
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["alice@example.com", "bob@example.com"]);

    // carol is not a member: the team does not exist for her
    expect(await carol.call("teams_list")).toEqual([]);
    await expect(carol.call("teams_get", { teamId })).rejects.toThrow(
      /Team not found/,
    );
    await expect(
      carol.call("teams_rename", { teamId, name: "Mine" }),
    ).rejects.toThrow(/Not a member/);
    await expect(
      carol.call("teams_delete", { teamId, confirm: true }),
    ).rejects.toThrow(/Owner role required/);
    await expect(
      bob.call("teams_rename", { teamId, name: "Bob's" }),
    ).rejects.toThrow(/Requires role: owner/);
    await expect(
      bob.call("teams_remove_member", {
        teamId,
        userId: bobUser.userId,
        confirm: true,
      }),
    ).rejects.toThrow(/Requires role: owner/);

    // destructive tools need confirm: true
    for (const [spec, args] of [
      [teamsToolSpecs.teams_delete, { teamId }],
      [teamsToolSpecs.teams_delete, { teamId, confirm: false }],
      [teamsToolSpecs.teams_remove_member, { teamId, userId: bobUser.userId }],
    ] as const) {
      expect(spec.schema.safeParse(args).success).toBe(false);
    }

    await alice.call("teams_rename", { teamId, name: "Crew 2" });
    expect(
      teamGetSchema.parse(await alice.call("teams_get", { teamId })).name,
    ).toBe("Crew 2");
    await expect(alice.call("teams_leave", { teamId })).rejects.toThrow(
      /last owner/,
    );
    await alice.call("teams_remove_member", {
      teamId,
      userId: bobUser.userId,
      confirm: true,
    });
    expect(await bob.call("teams_list")).toEqual([]);
    expect(await alice.call("teams_delete", { teamId, confirm: true })).toEqual(
      {
        deleted: true,
      },
    );
    expect(await alice.call("teams_list")).toEqual([]);
  });
});

describe("MCP profile parity tools (convex-test backend)", () => {
  it("profile tools use the UI choices and stay inside the caller's profiles", async () => {
    const t = createConvexBackend();
    const aliceUser = await signUp(t, ALICE, "alice@example.com");
    const bobUser = await signUp(t, BOB, "bob@example.com");
    const alice = mcpCaller(t, ALICE);
    const bob = mcpCaller(t, BOB);

    expect(
      profilesToolSpecs.profiles_create.schema.safeParse({
        name: "Work",
        color: "#123456",
      }).success,
    ).toBe(false);
    expect(
      profilesToolSpecs.profiles_create.schema.safeParse({
        name: "Work",
        icon: "skull",
      }).success,
    ).toBe(false);

    const work = profileSchema.parse(
      await alice.call("profiles_create", { name: "Work", icon: "code" }),
    );
    expect(work).toMatchObject({
      name: "Work",
      color: "#171717",
      icon: "code",
    });
    await expect(
      alice.call("profiles_create", { name: "Work" }),
    ).rejects.toThrow(/already exists/);

    expect(
      profileSchema.parse(
        await alice.call("profiles_update", {
          profileId: work.id,
          color: "#10B981",
        }),
      ).color,
    ).toBe("#10B981");

    // bob cannot see, edit, delete or default to alice's profiles
    for (const [name, args] of [
      ["profiles_update", { profileId: work.id, name: "Bob's" }],
      ["profiles_delete", { profileId: work.id, confirm: true }],
      [
        "profiles_delete",
        {
          profileId: bobUser.profileId,
          moveMemoriesToProfileId: work.id,
          confirm: true,
        },
      ],
      ["set_active_profile", { profileId: work.id, source: "web" }],
    ] as const) {
      await expect(bob.call(name, args)).rejects.toThrow(/Profile not found/);
    }

    await alice.call("memory_add", {
      title: "Work note",
      content: "Ship the parity tools",
      type: "knowledge",
      source: "manual",
      profileId: work.id,
    });
    await expect(
      alice.call("profiles_delete", {
        profileId: aliceUser.profileId,
        confirm: true,
      }),
    ).rejects.toThrow(/default profile/);
    expect(
      await alice.call("profiles_delete", {
        profileId: work.id,
        moveMemoriesToProfileId: aliceUser.profileId,
        confirm: true,
      }),
    ).toEqual({ deleted: true });
    const moved = memorySearchSchema.parse(
      await alice.call("memory_search", { profileId: aliceUser.profileId }),
    );
    expect(moved.memories).toHaveLength(1);
  });

  it("set_active_profile sets the web and extension defaults; whoami has email", async () => {
    const t = createConvexBackend();
    const aliceUser = await signUp(t, ALICE, "alice@example.com");
    const alice = mcpCaller(t, ALICE);

    expect(
      await alice.call("set_active_profile", {
        profileId: aliceUser.profileId,
        source: "extension",
      }),
    ).toMatchObject({ id: aliceUser.profileId, source: "extension" });
    expect(await alice.call("settings_get")).toMatchObject({
      defaultProfiles: { extension: aliceUser.profileId },
    });
    expect(await alice.call("whoami")).toMatchObject({
      clerkUserId: ALICE,
      email: "alice@example.com",
      name: "alice@example.com",
    });
  });
});
