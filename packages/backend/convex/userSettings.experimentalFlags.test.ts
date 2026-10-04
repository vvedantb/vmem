import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { resolveExperimentalFlags } from "./experimentalFlags";

const modules = import.meta.glob("./**/*.ts");

describe("resolveExperimentalFlags", () => {
  it("defaults disablePageMotion to off", () => {
    expect(resolveExperimentalFlags(null)).toEqual({
      disablePageMotion: false,
    });
    expect(resolveExperimentalFlags(undefined)).toEqual({
      disablePageMotion: false,
    });
  });
});

describe("experimental flags", () => {
  it("rejects unauthenticated reads and writes", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.userSettings.getExperimentalFlags, {}),
    ).rejects.toThrow(/authenticated/i);
    await expect(
      t.mutation(api.userSettings.setExperimentalFlag, {
        key: "disablePageMotion",
        enabled: true,
      }),
    ).rejects.toThrow(/authenticated/i);
  });

  it("defaults disablePageMotion to false and persists on userSettings", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "clerk_experimental_flags" });
    await user.mutation(api.auth.ensureUserExists, {});

    expect(await user.query(api.userSettings.getExperimentalFlags, {})).toEqual(
      {
        disablePageMotion: false,
      },
    );

    await user.mutation(api.userSettings.setExperimentalFlag, {
      key: "disablePageMotion",
      enabled: true,
    });
    expect(await user.query(api.userSettings.getExperimentalFlags, {})).toEqual(
      {
        disablePageMotion: true,
      },
    );

    await user.mutation(api.userSettings.setExperimentalFlag, {
      key: "disablePageMotion",
      enabled: false,
    });
    expect(await user.query(api.userSettings.getExperimentalFlags, {})).toEqual(
      {
        disablePageMotion: false,
      },
    );
  });

  it("keeps each user's experimental flags isolated", async () => {
    const t = convexTest(schema, modules);
    const userA = t.withIdentity({ subject: "clerk_exp_a" });
    const userB = t.withIdentity({ subject: "clerk_exp_b" });
    await userA.mutation(api.auth.ensureUserExists, {});
    await userB.mutation(api.auth.ensureUserExists, {});

    await userA.mutation(api.userSettings.setExperimentalFlag, {
      key: "disablePageMotion",
      enabled: true,
    });

    expect(
      await userA.query(api.userSettings.getExperimentalFlags, {}),
    ).toEqual({ disablePageMotion: true });
    expect(
      await userB.query(api.userSettings.getExperimentalFlags, {}),
    ).toEqual({ disablePageMotion: false });
  });
});
