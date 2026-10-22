/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_hash_dedupe_user";
const FOLLOW_UPS = [
  "memoryEmbed:embedMemoryInternal",
  "memoryExtract:extractMemoryEntitiesInternal",
];

type Harness = ReturnType<typeof convexTest>;

function storeArgs(
  overrides: {
    profileId?: string;
    source?: string;
    tags?: string[];
    confidence?: number;
    status?: "active" | "pinned";
    skipHashDedupe?: boolean;
  } = {},
) {
  return {
    userId: USER,
    profileId: overrides.profileId ?? "profile_a",
    title: "Prefers pnpm",
    content: "Use pnpm for vmem",
    type: "knowledge" as const,
    source: overrides.source ?? "mcp",
    tags: overrides.tags ?? ["tooling"],
    confidence: overrides.confidence ?? 0.5,
    status: overrides.status,
    skipHashDedupe: overrides.skipHashDedupe,
  };
}

async function rowsFor(t: Harness, profileId: string) {
  const rows = await t.run((ctx) => ctx.db.query("memories").collect());
  return rows.filter((row) => row.profileId === profileId);
}

async function followUpCount(t: Harness) {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs.filter((job) => FOLLOW_UPS.includes(job.name)).length;
}

describe("createMemory exact-hash dedupe", () => {
  it("absorbs an exact repeat into the live row", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs(),
    );
    const repeat = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      {
        ...storeArgs({ source: "claude", tags: ["pnpm"], confidence: 0.9 }),
        // case and whitespace do not change the hash
        content: "use  PNPM for vmem",
      },
    );

    expect(first.deduped).toBeUndefined();
    expect(repeat.deduped).toBe(true);
    expect(repeat.id).toBe(first.id);
    expect(repeat.content).toBe("Use pnpm for vmem");
    expect(repeat.updatedAt).toBe(first.updatedAt);
    expect(repeat.tags).toEqual(["tooling", "pnpm"]);
    expect(repeat.confidence).toBe(0.9);

    const rows = await rowsFor(t, "profile_a");
    expect(rows).toHaveLength(1);
    expect(rows[0].visitCount).toBe(2);
    expect(rows[0].sources).toEqual(["mcp", "claude"]);
    expect(rows[0].source).toBe("mcp");
  });

  it("caps sources at 10 and keeps them unique", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 14; i++) {
      await t.mutation(
        internal.memoryStore.functions.createMemoryInternal,
        storeArgs({ source: `src_${i % 12}` }),
      );
    }
    const [row] = await rowsFor(t, "profile_a");
    expect(row.visitCount).toBe(14);
    expect(row.sources).toEqual(
      Array.from({ length: 10 }, (_, i) => `src_${i}`),
    );
  });

  it("keeps a separate row per profile", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs({ profileId: "profile_a" }),
    );
    const other = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs({ profileId: "profile_team" }),
    );
    expect(other.deduped).toBeUndefined();
    expect(await rowsFor(t, "profile_a")).toHaveLength(1);
    expect(await rowsFor(t, "profile_team")).toHaveLength(1);
  });

  it("inserts a new row when the match is suppressed or expired", async () => {
    const t = convexTest(schema, modules);
    const suppressed = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs(),
    );
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("memories").collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, { status: "suppressed" });
      }
    });
    const fresh = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs(),
    );
    expect(fresh.id).not.toBe(suppressed.id);
    expect(fresh.deduped).toBeUndefined();

    await t.run(async (ctx) => {
      const rows = await ctx.db.query("memories").collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
      }
    });
    const afterExpiry = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs(),
    );
    expect(afterExpiry.deduped).toBeUndefined();
    expect(await rowsFor(t, "profile_a")).toHaveLength(3);
  });

  it("only bumps visits on a pinned match", async () => {
    const t = convexTest(schema, modules);
    const pinned = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs({ status: "pinned" }),
    );
    const repeat = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs({ source: "claude", tags: ["pnpm"], confidence: 0.9 }),
    );
    expect(repeat.id).toBe(pinned.id);
    expect(repeat.deduped).toBe(true);
    expect(repeat.status).toBe("pinned");
    expect(repeat.tags).toEqual(["tooling"]);
    expect(repeat.confidence).toBe(0.5);
    const [row] = await rowsFor(t, "profile_a");
    expect(row.visitCount).toBe(2);
    expect(row.sources).toBeUndefined();
  });

  it("skips the hash lookup for opted-out and source-keyed writes", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs(),
    );
    const merged = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      storeArgs({ source: "dream-merge", skipHashDedupe: true }),
    );
    const keyed = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      { ...storeArgs(), sourceType: "browsing-history", sourceId: "key" },
    );
    expect(merged.deduped).toBeUndefined();
    expect(keyed.deduped).toBeUndefined();
    expect(await rowsFor(t, "profile_a")).toHaveLength(3);
  });
});

describe("memoryApi.createMemory exact-hash dedupe", () => {
  // scheduled embed/extract jobs stay queued so the test can count them
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns deduped and schedules no follow-up jobs on a repeat", async () => {
    const t = convexTest(schema, modules);
    registerAuditLog(t);
    const user = t.withIdentity({
      subject: USER,
      email: "dedupe@example.com",
      name: "dedupe@example.com",
    });
    await user.mutation(api.auth.ensureUserExists, {});
    const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
    if (!profile) throw new Error("profile missing");
    const args = {
      title: "Prefers pnpm",
      content: "Use pnpm for vmem",
      type: "knowledge" as const,
      source: "mcp",
      tags: ["tooling"],
      confidence: 1,
      profileId: profile._id,
    };

    const first = await user.action(api.memoryApi.createMemory, args);
    expect(await followUpCount(t)).toBe(2);

    const repeat = await user.action(api.memoryApi.createMemory, {
      ...args,
      source: "sdk",
    });
    expect(repeat.id).toBe(first.id);
    expect(repeat.deduped).toBe(true);
    expect(await followUpCount(t)).toBe(2);
  });
});
