/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function planSlugs(t: ReturnType<typeof convexTest>, clerkId: string) {
  return await t.run(async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.find((user) => user.clerkId === clerkId)?.planSlugs;
  });
}

describe("clerk billing writers", () => {
  it("replaces slugs and merges single items", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_a" });
    });

    expect(
      await t.mutation(internal.clerkBilling.replacePlanSlugsInternal, {
        clerkId: "user_a",
        planSlugs: ["v_pro"],
      }),
    ).toBe(true);
    expect(await planSlugs(t, "user_a")).toEqual(["v_pro"]);

    await t.mutation(internal.clerkBilling.applyPlanItemInternal, {
      clerkId: "user_a",
      status: "ended",
      slug: "v_pro",
    });
    expect(await planSlugs(t, "user_a")).toEqual([]);

    await t.mutation(internal.clerkBilling.applyPlanItemInternal, {
      clerkId: "user_a",
      status: "active",
      slug: "v_pro",
    });
    expect(await planSlugs(t, "user_a")).toEqual(["v_pro"]);
  });

  it("ignores a Clerk id without a users row", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.mutation(internal.clerkBilling.applyPlanItemInternal, {
        clerkId: "user_missing",
        status: "active",
        slug: "v_pro",
      }),
    ).toBe(false);
  });

  it("pages users that have a Clerk id", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "user_a" });
      await ctx.db.insert("users", {});
    });
    const page = await t.query(internal.clerkBilling.listClerkIdsPageInternal, {
      cursor: null,
      numItems: 10,
    });
    expect(page.clerkIds).toEqual(["user_a"]);
    expect(page.isDone).toBe(true);
  });
});
