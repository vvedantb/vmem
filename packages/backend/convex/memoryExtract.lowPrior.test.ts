/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { isLowPriorSource } from "../engine/memory/usefulness";

const modules = import.meta.glob("./**/*.ts");

const EMBED = "memoryEmbed:embedMemoryInternal";
const EXTRACT = "memoryExtract:extractMemoryEntitiesInternal";

async function setup() {
  const t = convexTest(schema, modules);
  registerAuditLog(t);
  const user = t.withIdentity({
    subject: "clerk_low_prior_user",
    email: "low@example.com",
    name: "low@example.com",
  });
  await user.mutation(api.auth.ensureUserExists, {});
  const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
  if (!profile) throw new Error("profile missing");
  return { t, user, profileId: profile._id };
}

async function jobNames(t: ReturnType<typeof convexTest>): Promise<string[]> {
  const jobs = await t.run(async (ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs
    .map((job) => job.name)
    .filter((name) => name === EMBED || name === EXTRACT);
}

function memoryArgs(source: string, sourceType?: string) {
  return {
    title: `${source} row`,
    content: `content from ${source} ${sourceType ?? ""}`,
    type: "knowledge" as const,
    source,
    sourceType,
    tags: [],
    confidence: 0.5,
  };
}

describe("isLowPriorSource", () => {
  it("matches browsing-history, bookmarks and desktop on source or sourceType", () => {
    expect(isLowPriorSource("browsing-history")).toBe(true);
    expect(isLowPriorSource("bookmarks")).toBe(true);
    expect(isLowPriorSource("desktop")).toBe(true);
    expect(isLowPriorSource("browser-extension", "browsing-history")).toBe(
      true,
    );
    expect(isLowPriorSource("mcp")).toBe(false);
    expect(isLowPriorSource("browser-extension", null)).toBe(false);
    expect(isLowPriorSource("gmail", "gmail")).toBe(false);
  });
});

describe("entity extraction for low-prior sources", () => {
  // scheduled embed/extract jobs stay queued so the test can read them
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["browsing-history", "browsing-history"],
    ["bookmarks", "bookmarks"],
    ["desktop", undefined],
  ])(
    "createMemory action embeds but skips extraction for %s",
    async (source, sourceType) => {
      const { t, user, profileId } = await setup();
      await user.action(api.memoryApi.createMemory, {
        ...memoryArgs(source, sourceType),
        profileId,
      });
      expect(await jobNames(t)).toEqual([EMBED]);
    },
  );

  it("createMemory action still extracts for deliberate sources", async () => {
    const { t, user, profileId } = await setup();
    await user.action(api.memoryApi.createMemory, {
      ...memoryArgs("mcp"),
      profileId,
    });
    expect((await jobNames(t)).sort()).toEqual([EMBED, EXTRACT]);
  });

  it("web create and update mutations skip extraction for low-prior rows", async () => {
    const { t, user, profileId } = await setup();
    const created = await user.mutation(api.memoryApi.create, {
      ...memoryArgs("bookmarks", "bookmarks"),
      profileId,
    });
    expect(await jobNames(t)).toEqual([EMBED]);

    await user.mutation(api.memoryApi.update, {
      memoryId: created.id,
      profileId,
      content: "bookmark body, edited",
    });
    expect(await jobNames(t)).toEqual([EMBED, EMBED]);
  });

  it("updateMemory action skips extraction for low-prior rows", async () => {
    const { t, user, profileId } = await setup();
    const created = await user.action(api.memoryApi.createMemory, {
      ...memoryArgs("browsing-history", "browsing-history"),
      profileId,
    });
    await user.action(api.memoryApi.updateMemory, {
      memoryId: created.id,
      profileId,
      content: "visited again, new title",
    });
    expect(await jobNames(t)).toEqual([EMBED, EMBED]);
  });
});
