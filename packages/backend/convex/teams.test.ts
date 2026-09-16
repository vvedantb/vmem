/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
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

describe("teams sharing", () => {
  it("normalizes mixed-case emails so addMember can find the user", async () => {
    const t = testConvex();
    const owner = asUser(t, "clerk_team_owner", "owner@example.com");
    const member = asUser(t, "clerk_team_member", "Member@Example.com");

    await owner.mutation(api.auth.ensureUserExists, {});
    await member.mutation(api.auth.ensureUserExists, {});

    const me = await member.query(api.users.getMe, {});
    expect(me?.email).toBe("member@example.com");

    const created = await owner.mutation(api.teams.create, { name: "Acme" });
    await owner.mutation(api.teams.addMember, {
      teamId: created.teamId,
      email: "MEMBER@example.com",
    });

    const memberAs = asUser(t, "clerk_team_member", "member@example.com");
    const profiles = await memberAs.query(api.profiles.list, {});
    expect(profiles.some((p) => p._id === created.profileId)).toBe(true);

    await memberAs.mutation(api.userSettings.setDefaultProfile, {
      source: "extension",
      profileId: created.profileId,
    });
    const defaultId = await memberAs.query(api.userSettings.getDefaultProfile, {
      source: "extension",
    });
    expect(defaultId).toBe(created.profileId);
  });

  it("returns a client-visible ConvexError when the email has no account", async () => {
    const t = testConvex();
    const owner = asUser(t, "clerk_team_owner_missing", "owner2@example.com");
    await owner.mutation(api.auth.ensureUserExists, {});
    const created = await owner.mutation(api.teams.create, { name: "Beta" });

    try {
      await owner.mutation(api.teams.addMember, {
        teamId: created.teamId,
        email: "ghost@example.com",
      });
      expect.unreachable("addMember should fail");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ConvexError);
      if (!(err instanceof ConvexError)) {
        throw err;
      }
      const data: unknown = err.data;
      let message: unknown = data;
      if (typeof data === "string") {
        const parsed: unknown = JSON.parse(data);
        if (typeof parsed === "string") message = parsed;
      }
      expect(message).toBe("No vmem account for that email");
    }
  });

  it("lets a member leave and then hides the team profile", async () => {
    const t = testConvex();
    const owner = asUser(
      t,
      "clerk_team_leave_owner",
      "leave-owner@example.com",
    );
    const member = asUser(
      t,
      "clerk_team_leave_member",
      "leave-member@example.com",
    );
    await owner.mutation(api.auth.ensureUserExists, {});
    await member.mutation(api.auth.ensureUserExists, {});
    const created = await owner.mutation(api.teams.create, { name: "Gamma" });
    await owner.mutation(api.teams.addMember, {
      teamId: created.teamId,
      email: "leave-member@example.com",
    });

    await member.mutation(api.teams.leaveTeam, { teamId: created.teamId });
    const profiles = await member.query(api.profiles.list, {});
    expect(profiles.some((p) => p._id === created.profileId)).toBe(false);
  });
});
