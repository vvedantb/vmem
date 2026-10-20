import { describe, expect, it } from "vitest";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  asUser,
  createConvexBackend,
  mcpCaller,
  signUp,
  type ConvexTestBackend,
} from "./convexHarness";

const ALICE = "clerk_skills_alice";
const BOB = "clerk_skills_bob";

const skillListSchema = z.array(
  z.object({
    name: z.string(),
    enabled: z.boolean(),
    source: z.enum(["personal", "system"]),
    origin: z.string().nullable(),
    createdAt: z.number().nullable(),
  }),
);
const historySchema = z.object({
  name: z.string(),
  versions: z.array(z.object({ versionId: z.string(), source: z.string() })),
});
const versionSchema = z.object({ instructions: z.string() });
const skillRowSchema = z.object({ instructions: z.string() });
const catalogSchema = z.array(
  z.object({
    systemSkillId: z.string(),
    name: z.string(),
    installed: z.boolean(),
    installEnabled: z.boolean(),
  }),
);

async function insertSystemSkill(
  t: ConvexTestBackend,
  name: string,
  published: boolean,
): Promise<Id<"systemSkills">> {
  return t.run((ctx) =>
    ctx.db.insert("systemSkills", {
      name,
      description: `${name} description`,
      instructions: `${name} steps`,
      category: "testing",
      published,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

describe("MCP skills parity tools (convex-test backend)", () => {
  it("lists disabled skills with metadata and keeps version tools per user", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const alice = mcpCaller(t, ALICE);
    const bob = mcpCaller(t, BOB);

    await alice.call("skills_create", {
      name: "deploy",
      description: "Ship it",
      instructions: "v1 steps",
    });
    await alice.call("skills_update", {
      name: "deploy",
      instructions: "v2 steps",
    });
    await alice.call("skills_update", { name: "deploy", enabled: false });

    const enabledOnly = skillListSchema.parse(await alice.call("skills_list"));
    expect(enabledOnly.some((skill) => skill.name === "deploy")).toBe(false);
    const withDisabled = skillListSchema.parse(
      await alice.call("skills_list", { includeDisabled: true }),
    );
    expect(withDisabled.find((skill) => skill.name === "deploy")).toMatchObject(
      { enabled: false, source: "personal", origin: "mcp" },
    );
    await expect(alice.call("skills_get", { name: "deploy" })).rejects.toThrow(
      /Skill not found/,
    );
    expect(
      skillRowSchema.parse(
        await alice.call("skills_get", {
          name: "deploy",
          includeDisabled: true,
        }),
      ).instructions,
    ).toBe("v2 steps");

    const history = historySchema.parse(
      await alice.call("skills_history", { name: "deploy" }),
    );
    expect(history.versions.length).toBeGreaterThanOrEqual(2);
    const oldest = history.versions[history.versions.length - 1];
    if (oldest === undefined) throw new Error("expected a version");
    expect(
      versionSchema.parse(
        await alice.call("skills_version_get", { versionId: oldest.versionId }),
      ).instructions,
    ).toBe("v1 steps");

    await expect(
      bob.call("skills_history", { name: "deploy" }),
    ).rejects.toThrow(/Skill not found/);
    await expect(
      bob.call("skills_version_get", { versionId: oldest.versionId }),
    ).rejects.toThrow(/Version not found/);
    await expect(
      bob.call("skills_restore_version", { versionId: oldest.versionId }),
    ).rejects.toThrow(/Version not found/);
    await expect(
      alice.call("skills_version_get", { versionId: "nope" }),
    ).rejects.toThrow(/Version not found/);

    expect(
      skillRowSchema.parse(
        await alice.call("skills_restore_version", {
          versionId: oldest.versionId,
        }),
      ).instructions,
    ).toBe("v1 steps");
  });

  it("does not reach team skill versions from the personal connector", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    const owner = asUser(t, ALICE, "alice@example.com");
    const team = await owner.mutation(api.teams.create, { name: "Skills" });
    const skillId = await owner.mutation(api.skills.createSkill, {
      name: "team-runbook",
      description: "Team",
      instructions: "team v1",
      teamId: team.teamId,
    });
    await owner.mutation(api.skills.updateSkill, {
      id: skillId,
      instructions: "team v2",
    });

    const teamHistory = historySchema.parse(
      await mcpCaller(t, ALICE, "team").call("skills_history", {
        name: "team-runbook",
      }),
    );
    const version = teamHistory.versions[0];
    if (version === undefined) throw new Error("expected a team version");

    const personal = mcpCaller(t, ALICE);
    await expect(
      personal.call("skills_history", { name: "team-runbook" }),
    ).rejects.toThrow(/Skill not found/);
    await expect(
      personal.call("skills_version_get", { versionId: version.versionId }),
    ).rejects.toThrow(/Version not found/);
    await expect(
      personal.call("skills_restore_version", { versionId: version.versionId }),
    ).rejects.toThrow(/Version not found/);
  });

  it("system skill catalogue hides drafts and keeps installs per workspace", async () => {
    const t = createConvexBackend();
    const alice = await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const published = await insertSystemSkill(t, "hub-published", true);
    const draft = await insertSystemSkill(t, "hub-draft", false);
    const aliceMcp = mcpCaller(t, ALICE);
    const bobMcp = mcpCaller(t, BOB);

    const names = catalogSchema
      .parse(await aliceMcp.call("skills_catalog_list"))
      .map((row) => row.name);
    expect(names).toContain("hub-published");
    expect(names).not.toContain("hub-draft");
    await expect(
      aliceMcp.call("skills_catalog_install", { systemSkillId: draft }),
    ).rejects.toThrow(/System skill not found/);
    await expect(
      aliceMcp.call("skills_catalog_install", { systemSkillId: "bad-id" }),
    ).rejects.toThrow(/System skill not found/);

    await aliceMcp.call("skills_catalog_install", { systemSkillId: published });
    await aliceMcp.call("skills_catalog_set_enabled", {
      systemSkillId: published,
      enabled: false,
    });
    const aliceRow = catalogSchema
      .parse(await aliceMcp.call("skills_catalog_list"))
      .find((row) => row.name === "hub-published");
    expect(aliceRow).toMatchObject({ installed: true, installEnabled: false });
    expect(
      skillListSchema
        .parse(await aliceMcp.call("skills_list", { includeDisabled: true }))
        .find((skill) => skill.name === "hub-published"),
    ).toMatchObject({ source: "system", enabled: false, origin: null });

    // Bob sees his own (empty) install state and cannot touch Alice's
    expect(
      catalogSchema
        .parse(await bobMcp.call("skills_catalog_list"))
        .find((row) => row.name === "hub-published"),
    ).toMatchObject({ installed: false });
    await expect(
      bobMcp.call("skills_catalog_set_enabled", {
        systemSkillId: published,
        enabled: true,
      }),
    ).rejects.toThrow(/Not installed/);
    expect(
      await bobMcp.call("skills_catalog_uninstall", {
        systemSkillId: published,
      }),
    ).toMatchObject({ uninstalled: false });

    expect(
      await aliceMcp.call("skills_catalog_uninstall", {
        systemSkillId: published,
      }),
    ).toMatchObject({ uninstalled: true });

    // admins see drafts, as in the web hub
    await t.run((ctx) => ctx.db.patch(alice.userId, { isAdmin: true }));
    expect(
      catalogSchema
        .parse(await aliceMcp.call("skills_catalog_list"))
        .map((row) => row.name),
    ).toContain("hub-draft");
  });
});
