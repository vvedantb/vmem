// AI-generated (Claude), prompt: "convex auth isolation tests for skills list create and update"
// Modified by me: kept the vite client reference at the top
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("authenticated Convex access", () => {
  it("rejects unauthenticated reads of user-owned data", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.skills.listMy, {})).rejects.toThrow(
      /authenticated/i,
    );
  });

  it("keeps each user's skills isolated", async () => {
    const t = convexTest(schema, modules);

    const userA = t.withIdentity({ subject: "clerk_user_a" });
    const userB = t.withIdentity({ subject: "clerk_user_b" });

    await userA.mutation(api.auth.ensureUserExists, {});
    await userB.mutation(api.auth.ensureUserExists, {});

    await userA.mutation(api.skills.createSkill, {
      name: "Private skill",
      description: "Only user A",
      instructions: "Do not share",
    });

    const userASkills = await userA.query(api.skills.listMy, {});
    const userBSkills = await userB.query(api.skills.listMy, {});

    expect(userASkills).toHaveLength(1);
    expect(userASkills[0]?.name).toBe("Private skill");
    expect(userBSkills).toHaveLength(0);
  });

  it("prevents one user from updating another user's skill", async () => {
    const t = convexTest(schema, modules);

    const userA = t.withIdentity({ subject: "clerk_user_a_update" });
    const userB = t.withIdentity({ subject: "clerk_user_b_update" });

    await userA.mutation(api.auth.ensureUserExists, {});
    await userB.mutation(api.auth.ensureUserExists, {});

    const skillId = await userA.mutation(api.skills.createSkill, {
      name: "Owned by A",
      description: "desc",
      instructions: "inst",
    });

    await expect(
      userB.mutation(api.skills.updateSkill, {
        id: skillId,
        name: "Hijacked",
      }),
    ).rejects.toThrow();
  });

  it("shares skill records between web create and MCP update", async () => {
    const t = convexTest(schema, modules);
    const clerkId = "clerk_skill_shared_path";
    const user = t.withIdentity({ subject: clerkId });

    await user.mutation(api.auth.ensureUserExists, {});
    await user.mutation(api.skills.createSkill, {
      name: "Shared skill",
      description: "from web",
      instructions: "do the thing",
    });

    const updated = await t.mutation(internal.skills.updateByClerkIdInternal, {
      clerkId,
      name: "Shared skill",
      description: "from mcp",
      instructions: "do the thing better",
    });

    expect(updated.description).toBe("from mcp");
    expect(updated.instructions).toBe("do the thing better");

    const listed = await user.query(api.skills.listMy, {});
    expect(listed).toHaveLength(1);
    expect(listed[0]?.description).toBe("from mcp");
    expect(listed[0]?.instructions).toBe("do the thing better");
  });
});
