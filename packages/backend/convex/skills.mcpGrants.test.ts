/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { skillMatchesMcpGrant } from "./skills";

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

describe("MCP skill grants", () => {
  it("treats personal vs team teamId as the MCP grant boundary", () => {
    expect(
      skillMatchesMcpGrant(
        { teamId: undefined },
        { userId: "users_a" as never, teamId: undefined },
      ),
    ).toBe(true);
    expect(
      skillMatchesMcpGrant(
        { teamId: "teams_1" as never },
        { userId: "users_a" as never, teamId: "teams_1" as never },
      ),
    ).toBe(true);
    expect(
      skillMatchesMcpGrant(
        { teamId: "teams_1" as never },
        { userId: "users_a" as never, teamId: undefined },
      ),
    ).toBe(false);
  });

  it("keeps personal and team MCP skill lists isolated and always includes search-skills-first", async () => {
    const t = testConvex();
    const owner = asUser(t, "clerk_grant_owner", "owner@example.com");
    const member = asUser(t, "clerk_grant_member", "member@example.com");

    await owner.mutation(api.auth.ensureUserExists, {});
    await member.mutation(api.auth.ensureUserExists, {});

    const created = await owner.mutation(api.teams.create, { name: "Acme" });
    await owner.mutation(api.teams.addMember, {
      teamId: created.teamId,
      email: "member@example.com",
    });

    await owner.mutation(api.skills.createSkill, {
      name: "personal-only",
      description: "Owner private playbook",
      instructions: "Do not share",
    });
    await owner.mutation(api.skills.createSkill, {
      name: "team-shared",
      description: "Team deploy playbook",
      instructions: "Ship together",
      teamId: created.teamId,
    });

    const ownerPersonal = await t.query(
      internal.skills.listEffectiveByClerkIdInternal,
      { clerkId: "clerk_grant_owner", scope: "personal" },
    );
    const ownerTeam = await t.query(
      internal.skills.listEffectiveByClerkIdInternal,
      { clerkId: "clerk_grant_owner", scope: "team" },
    );
    const memberPersonal = await t.query(
      internal.skills.listEffectiveByClerkIdInternal,
      { clerkId: "clerk_grant_member", scope: "personal" },
    );
    const memberTeam = await t.query(
      internal.skills.listEffectiveByClerkIdInternal,
      { clerkId: "clerk_grant_member", scope: "team" },
    );

    expect(ownerPersonal.map((s) => s.name)).toContain("personal-only");
    expect(ownerPersonal.map((s) => s.name)).not.toContain("team-shared");
    expect(ownerPersonal.map((s) => s.name)).toContain("search-skills-first");
    expect(ownerPersonal.every((s) => s.grant === "personal")).toBe(true);

    expect(ownerTeam.map((s) => s.name)).toContain("team-shared");
    expect(ownerTeam.map((s) => s.name)).not.toContain("personal-only");
    expect(ownerTeam.map((s) => s.name)).toContain("search-skills-first");
    expect(ownerTeam.every((s) => s.grant === "team")).toBe(true);

    expect(memberPersonal.map((s) => s.name)).not.toContain("personal-only");
    expect(memberPersonal.map((s) => s.name)).not.toContain("team-shared");
    expect(memberTeam.map((s) => s.name)).toContain("team-shared");
    expect(memberTeam.map((s) => s.name)).not.toContain("personal-only");

    const leaked = await t.query(internal.skills.getEffectiveByNameInternal, {
      clerkId: "clerk_grant_owner",
      scope: "personal",
      name: "team-shared",
    });
    expect(leaked).toBeNull();

    await expect(
      t.mutation(internal.skills.updateByClerkIdInternal, {
        clerkId: "clerk_grant_member",
        scope: "personal",
        name: "personal-only",
        description: "hijack",
      }),
    ).rejects.toThrow(/Skill not found/);

    await expect(
      t.mutation(internal.skills.deleteByClerkIdInternal, {
        clerkId: "clerk_grant_owner",
        scope: "personal",
        name: "team-shared",
      }),
    ).rejects.toThrow(/Skill not found/);
  });
});
