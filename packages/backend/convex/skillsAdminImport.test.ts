/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function testConvex() {
  const t = convexTest(schema, modules);
  registerAuditLog(t);
  return t;
}

const ALPHA = {
  name: "alpha",
  description: "Alpha skill",
  instructions: "Do alpha",
};
const BETA = {
  name: "beta",
  description: "Beta skill",
  instructions: "Do beta",
};
const ITEMS = [ALPHA, BETA];

async function skillRows(t: ReturnType<typeof testConvex>, clerkId: string) {
  return await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();
    if (!user) return null;
    return await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("userId"), user._id))
      .collect();
  });
}

describe("skillsAdminImport.importForClerkUser", () => {
  it("dry run reports counts and writes nothing", async () => {
    const t = testConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_dry" });
    });
    const res = await t.mutation(
      internal.skillsAdminImport.importForClerkUser,
      {
        clerkUserId: "user_dry",
        items: ITEMS,
        dryRun: true,
      },
    );
    expect(res).toMatchObject({
      status: "imported",
      dryRun: true,
      created: 2,
      updated: 0,
      skipped: 0,
    });
    expect(await skillRows(t, "user_dry")).toHaveLength(0);
  });

  it("imports with origin vibot and is idempotent", async () => {
    const t = testConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_real" });
    });
    const args = { clerkUserId: "user_real", items: ITEMS, dryRun: false };
    const first = await t.mutation(
      internal.skillsAdminImport.importForClerkUser,
      args,
    );
    expect(first).toMatchObject({ created: 2, updated: 0, skipped: 0 });
    const rows = await skillRows(t, "user_real");
    expect(rows).toHaveLength(2);
    expect(rows?.every((r) => r.origin === "vibot" && r.enabled)).toBe(true);

    const second = await t.mutation(
      internal.skillsAdminImport.importForClerkUser,
      args,
    );
    expect(second).toMatchObject({ created: 0, updated: 0, skipped: 2 });
    expect(await skillRows(t, "user_real")).toHaveLength(2);

    // dry run after the import predicts a no-op, and a changed body an update
    const dry = await t.mutation(
      internal.skillsAdminImport.importForClerkUser,
      {
        ...args,
        dryRun: true,
        items: [ALPHA, { ...BETA, instructions: "Do beta v2" }],
      },
    );
    expect(dry).toMatchObject({ created: 0, updated: 1, skipped: 1 });
    const unchanged = await skillRows(t, "user_real");
    expect(unchanged?.find((r) => r.name === "beta")?.instructions).toBe(
      "Do beta",
    );
  });

  it("skips empty rows", async () => {
    const t = testConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_empty" });
    });
    const res = await t.mutation(
      internal.skillsAdminImport.importForClerkUser,
      {
        clerkUserId: "user_empty",
        items: [
          ...ITEMS,
          { name: " ", description: "x", instructions: "y" },
          { name: "gamma", description: "g", instructions: "  " },
        ],
        dryRun: false,
      },
    );
    expect(res).toMatchObject({ created: 2, skipped: 2 });
  });

  it("skips users without a vmem row unless createMissingUser is set", async () => {
    const t = testConvex();
    const skipped = await t.mutation(
      internal.skillsAdminImport.importForClerkUser,
      { clerkUserId: "user_none", items: ITEMS, dryRun: false },
    );
    expect(skipped.status).toBe("skipped_no_user");
    expect(await skillRows(t, "user_none")).toBeNull();

    const profile = { email: " New@Example.com ", fullName: "New User" };
    const dry = await t.mutation(
      internal.skillsAdminImport.importForClerkUser,
      {
        clerkUserId: "user_none",
        items: ITEMS,
        dryRun: true,
        createMissingUser: profile,
      },
    );
    expect(dry).toMatchObject({ status: "would_create_user", created: 2 });
    expect(await skillRows(t, "user_none")).toBeNull();

    const real = await t.mutation(
      internal.skillsAdminImport.importForClerkUser,
      {
        clerkUserId: "user_none",
        items: ITEMS,
        dryRun: false,
        createMissingUser: profile,
      },
    );
    expect(real).toMatchObject({ status: "created_user", created: 2 });
    const user = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "user_none"))
        .first(),
    );
    expect(user?.email).toBe("new@example.com");
    const profiles = await t.run(async (ctx) =>
      ctx.db.query("profiles").collect(),
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.isDefault).toBe(true);
  });

  it("rejects duplicate names and email collisions", async () => {
    const t = testConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_a",
        email: "a@example.com",
      });
    });
    await expect(
      t.mutation(internal.skillsAdminImport.importForClerkUser, {
        clerkUserId: "user_a",
        items: [ALPHA, { ...ALPHA, name: " alpha " }],
        dryRun: true,
      }),
    ).rejects.toThrow(/duplicate/);
    await expect(
      t.mutation(internal.skillsAdminImport.importForClerkUser, {
        clerkUserId: "user_b",
        items: [ALPHA],
        dryRun: false,
        createMissingUser: { email: "A@example.com" },
      }),
    ).rejects.toThrow(/email/);
  });

  it("rejects batches over 25", async () => {
    const t = testConvex();
    const items = Array.from({ length: 26 }, (_, i) => ({
      name: `s${i}`,
      description: "d",
      instructions: "i",
    }));
    await expect(
      t.mutation(internal.skillsAdminImport.importForClerkUser, {
        clerkUserId: "user_big",
        items,
        dryRun: true,
      }),
    ).rejects.toThrow(/at most 25/);
  });
});
