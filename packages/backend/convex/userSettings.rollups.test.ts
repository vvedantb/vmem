import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("rollupsEnabled", () => {
  it("defaults to off and is set only by the internal mutation", async () => {
    const t = convexTest(schema, modules);
    const clerkId = "clerk_rollups_flag";
    const user = t.withIdentity({ subject: clerkId });
    const { userId } = await user.mutation(api.auth.ensureUserExists, {});

    expect((await user.query(api.userSettings.get, {})).rollupsEnabled).toBe(
      false,
    );
    expect(
      await t.query(internal.userSettings.getRollupsEnabledInternal, {
        userId,
      }),
    ).toBe(false);

    await t.mutation(internal.userSettings.setRollupsEnabledByClerkIdInternal, {
      clerkId,
      enabled: true,
    });
    expect(
      await t.query(internal.userSettings.getRollupsEnabledInternal, {
        userId,
      }),
    ).toBe(true);
    expect((await user.query(api.userSettings.get, {})).rollupsEnabled).toBe(
      true,
    );
  });
});
