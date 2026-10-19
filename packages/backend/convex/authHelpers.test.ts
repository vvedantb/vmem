// Pins the current behaviour of the auth.ts user helpers and ensureUserExists
// so a refactor onto shared helpers can be checked against exact outputs.
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { getCurrentUserId, getUserByClerkId } from "./auth";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function only<T>(rows: T[]): T {
  const [row] = rows;
  if (rows.length !== 1 || row === undefined) {
    throw new Error(`expected 1 row, got ${rows.length}`);
  }
  return row;
}

function setup() {
  return convexTest(schema, modules);
}

describe("getUserByClerkId", () => {
  it("returns null when no row has the Clerk id", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "clerk_other" });
      expect(await getUserByClerkId(ctx, "clerk_missing")).toBeNull();
    });
  });

  it("returns the row for the Clerk id", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        clerkId: "clerk_found",
        email: "a@example.com",
      });
      const user = await getUserByClerkId(ctx, "clerk_found");
      expect(user?._id).toBe(id);
      expect(user?.email).toBe("a@example.com");
    });
  });

  it("returns the first row (does not throw) when the Clerk id is duplicated", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const first = await ctx.db.insert("users", { clerkId: "clerk_dup" });
      await ctx.db.insert("users", { clerkId: "clerk_dup" });
      const user = await getUserByClerkId(ctx, "clerk_dup");
      expect(user?._id).toBe(first);
    });
  });
});

describe("getCurrentUserId", () => {
  it("throws 'Not authenticated' with no identity", async () => {
    const t = setup();
    await expect(t.run(async (ctx) => getCurrentUserId(ctx))).rejects.toThrow(
      new Error("Not authenticated"),
    );
  });

  it("throws 'Not authenticated' when the identity has no users row", async () => {
    const t = setup().withIdentity({ subject: "clerk_no_row" });
    await expect(t.run(async (ctx) => getCurrentUserId(ctx))).rejects.toThrow(
      new Error("Not authenticated"),
    );
  });

  it("throws 'Not authenticated' when the identity subject is empty", async () => {
    const t = setup().withIdentity({ subject: "" });
    await expect(t.run(async (ctx) => getCurrentUserId(ctx))).rejects.toThrow(
      new Error("Not authenticated"),
    );
  });

  it("returns the users row id for the identity subject", async () => {
    const t = setup();
    const id = await t.run(async (ctx) =>
      ctx.db.insert("users", { clerkId: "clerk_me" }),
    );
    const result = await t
      .withIdentity({ subject: "clerk_me" })
      .run(async (ctx) => getCurrentUserId(ctx));
    expect(result).toBe(id);
  });

  it("backs api.auth.me with the same throw and result", async () => {
    const t = setup();
    await expect(t.query(api.auth.me, {})).rejects.toThrow(/Not authenticated/);
    const id = await t.run(async (ctx) =>
      ctx.db.insert("users", { clerkId: "clerk_me_query" }),
    );
    expect(
      await t
        .withIdentity({ subject: "clerk_me_query" })
        .query(api.auth.me, {}),
    ).toBe(id);
  });
});

describe("ensureUserExists", () => {
  it("throws 'Not authenticated' with no identity", async () => {
    const t = setup();
    await expect(t.mutation(api.auth.ensureUserExists, {})).rejects.toThrow(
      /Not authenticated/,
    );
    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users).toEqual([]);
  });

  it("throws 'Clerk user ID is required' when the identity subject is empty", async () => {
    const t = setup();
    await expect(
      t.withIdentity({ subject: "" }).mutation(api.auth.ensureUserExists, {}),
    ).rejects.toThrow(/Clerk user ID is required/);
    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users).toEqual([]);
  });

  it("inserts the user with claims and a Personal profile", async () => {
    const t = setup();
    const user = t.withIdentity({
      subject: "clerk_new",
      email: "  New.User@Example.COM ",
      givenName: "New",
      familyName: "User",
      name: "New User",
    });
    const result = await user.mutation(api.auth.ensureUserExists, {});
    expect(result.wasCreated).toBe(true);

    const rows = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      profiles: await ctx.db.query("profiles").collect(),
    }));
    const { _id, _creationTime, ...userFields } = only(rows.users);
    expect(_id).toBe(result.userId);
    expect(typeof _creationTime).toBe("number");
    expect(userFields).toEqual({
      clerkId: "clerk_new",
      email: "new.user@example.com",
      firstName: "New",
      lastName: "User",
      fullName: "New User",
    });

    const profile = only(rows.profiles);
    expect(profile).toMatchObject({
      userId: result.userId,
      name: "Personal",
      color: "#171717",
      icon: "user",
      isDefault: true,
    });
    expect(profile.createdAt).toBe(profile.updatedAt);
    expect(Object.keys(profile).sort()).toEqual([
      "_creationTime",
      "_id",
      "color",
      "createdAt",
      "icon",
      "isDefault",
      "name",
      "updatedAt",
      "userId",
    ]);
  });

  it("inserts only clerkId when the identity has no email or name claims", async () => {
    const t = setup();
    const result = await t
      .withIdentity({ subject: "clerk_bare", email: "   " })
      .mutation(api.auth.ensureUserExists, {});
    expect(result.wasCreated).toBe(true);
    const row = await t.run(async (ctx) => ctx.db.get(result.userId));
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "_creationTime",
      "_id",
      "clerkId",
    ]);
  });

  it("patches a changed normalised email on an existing user and creates no profile", async () => {
    const t = setup();
    const id = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_existing",
        email: "old@example.com",
        firstName: "Keep",
      }),
    );
    const result = await t
      .withIdentity({
        subject: "clerk_existing",
        email: "NEW@example.com",
        givenName: "Ignored",
      })
      .mutation(api.auth.ensureUserExists, {});
    expect(result).toEqual({ userId: id, wasCreated: false });
    const after = await t.run(async (ctx) => ({
      user: await ctx.db.get(id),
      profiles: await ctx.db.query("profiles").collect(),
    }));
    expect(after.user?.email).toBe("new@example.com");
    expect(after.user?.firstName).toBe("Keep");
    expect(after.profiles).toEqual([]);
  });

  it("leaves the existing email when the identity email is missing or unchanged", async () => {
    const t = setup();
    const id = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_same",
        email: "same@example.com",
      }),
    );
    await t
      .withIdentity({ subject: "clerk_same" })
      .mutation(api.auth.ensureUserExists, {});
    await t
      .withIdentity({ subject: "clerk_same", email: "Same@Example.com" })
      .mutation(api.auth.ensureUserExists, {});
    const user = await t.run(async (ctx) => ctx.db.get(id));
    expect(user?.email).toBe("same@example.com");
    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
  });
});

describe("ensureUserForClerkIdInternal", () => {
  it("returns the existing user without writes, else inserts with a Personal profile", async () => {
    const t = setup();
    const created = await t.mutation(
      internal.auth.ensureUserForClerkIdInternal,
      { clerkId: "clerk_http", email: " HTTP@Example.com " },
    );
    const again = await t.mutation(internal.auth.ensureUserForClerkIdInternal, {
      clerkId: "clerk_http",
      email: "other@example.com",
    });
    expect(again).toEqual(created);
    const rows = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      profiles: await ctx.db.query("profiles").collect(),
    }));
    expect(rows.users).toHaveLength(1);
    expect(rows.users[0]?.email).toBe("http@example.com");
    expect(rows.profiles).toHaveLength(1);
    expect(rows.profiles[0]?.name).toBe("Personal");
  });
});
