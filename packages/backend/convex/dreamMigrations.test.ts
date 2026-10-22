/// <reference types="vite/client" />
import { Crons } from "@convex-dev/crons";
import cronsTest from "@convex-dev/crons/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("dream schedule retirement", () => {
  it("deletes only the old dream-mode cron jobs", async () => {
    const t = convexTest(schema, modules);
    cronsTest.register(t);
    const crons = new Crons(components.crons);
    await t.run(async (ctx) => {
      for (const name of [
        "dream-mode:user:a",
        "dream-mode:profile_b",
        "other",
      ]) {
        await crons.register(
          ctx,
          { kind: "cron", cronspec: "0 4 * * *" },
          internal.dream.purgeExpiredActions,
          {},
          name,
        );
      }
    });

    expect(
      await t.mutation(internal.dreamMigrations.unregisterDreamCrons, {}),
    ).toBe(2);
    const left = await t.run(async (ctx) => await crons.list(ctx));
    expect(left.map((job) => job.name)).toEqual(["other"]);
  });

  it("clears the deprecated schedule fields", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "clerk_schedule" });
    const { userId } = await user.mutation(api.auth.ensureUserExists, {});
    const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
    if (!profile) throw new Error("profile missing");
    await t.run(async (ctx) => {
      await ctx.db.insert("userSettings", {
        userId,
        dreamModeScheduleEnabled: true,
        dreamModeScheduleTime: "09:30",
        dreamModeAutoAccept: true,
      });
      await ctx.db.patch(profile._id, { dreamModeScheduleEnabled: false });
    });

    const tables: ("userSettings" | "profiles")[] = [
      "userSettings",
      "profiles",
    ];
    for (const table of tables) {
      expect(
        await t.mutation(internal.dreamMigrations.clearDreamScheduleFields, {
          table,
        }),
      ).toBe(1);
    }
    const [settings, profileRow] = await t.run(async (ctx) => [
      await ctx.db.query("userSettings").first(),
      await ctx.db.get(profile._id),
    ]);
    expect(settings).toMatchObject({ dreamModeAutoAccept: true });
    expect(settings).not.toHaveProperty("dreamModeScheduleEnabled");
    expect(settings).not.toHaveProperty("dreamModeScheduleTime");
    expect(profileRow).not.toHaveProperty("dreamModeScheduleEnabled");
  });
});
