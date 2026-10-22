/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const FOLLOW_UPS = [
  "memoryEmbed:embedMemoryInternal",
  "memoryExtract:extractMemoryEntitiesInternal",
];

async function setup() {
  const t = convexTest(schema, modules);
  registerAuditLog(t);
  const user = t.withIdentity({
    subject: "clerk_external_id_user",
    email: "ext@example.com",
    name: "ext@example.com",
  });
  await user.mutation(api.auth.ensureUserExists, {});
  const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
  if (!profile) throw new Error("profile missing");
  return { t, user, profileId: profile._id };
}

async function followUpCount(t: ReturnType<typeof convexTest>) {
  const jobs = await t.run(async (ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs.filter((job) => FOLLOW_UPS.includes(job.name)).length;
}

describe("memoryApi.createMemory with externalId", () => {
  // scheduled embed/extract jobs stay queued so the test can count them
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("upserts one row and skips follow-up jobs on an identical repeat", async () => {
    const { t, user, profileId } = await setup();
    const args = {
      title: "vhub",
      content: "vhub hub page",
      type: "knowledge" as const,
      source: "browser-extension",
      sourceType: "browsing-history",
      tags: [],
      confidence: 0.5,
      url: "https://vhub.projectv.uk/",
      externalId: "vhub.projectv.uk|vhub",
      profileId,
    };

    // browsing-history is low-prior: embed only, no entity extraction
    const first = await user.action(api.memoryApi.createMemory, args);
    expect(await followUpCount(t)).toBe(1);

    const repeat = await user.action(api.memoryApi.createMemory, args);
    expect(repeat.id).toBe(first.id);
    expect(repeat.updatedAt).toBe(first.updatedAt);
    expect(await followUpCount(t)).toBe(1);

    const changed = await user.action(api.memoryApi.createMemory, {
      ...args,
      title: "vhub — connectors",
    });
    expect(changed.id).toBe(first.id);
    expect(changed.title).toBe("vhub — connectors");
    expect(await followUpCount(t)).toBe(2);

    const listed = await user.action(api.memoryApi.listMemories, {
      profileId,
      limit: 10,
      offset: 0,
    });
    expect(listed.memories).toHaveLength(1);
  });

  it("falls back to hash dedupe without externalId", async () => {
    const { user, profileId } = await setup();
    const args = {
      title: "note",
      content: "same body",
      type: "knowledge" as const,
      source: "api",
      tags: [],
      confidence: 1,
      profileId,
    };
    const first = await user.action(api.memoryApi.createMemory, args);
    const second = await user.action(api.memoryApi.createMemory, args);
    expect(second.id).toBe(first.id);
    expect(second.deduped).toBe(true);
  });

  it("web create mutation upserts on externalId and skips no-op follow-ups", async () => {
    const { t, user, profileId } = await setup();
    const args = {
      title: "vhub",
      content: "vhub hub page",
      type: "knowledge" as const,
      source: "web",
      tags: [],
      confidence: 0.5,
      externalId: " web-key ",
      profileId,
    };

    const first = await user.mutation(api.memoryApi.create, args);
    expect(await followUpCount(t)).toBe(2);

    const repeat = await user.mutation(api.memoryApi.create, {
      ...args,
      externalId: "web-key",
    });
    expect(repeat.id).toBe(first.id);
    expect(repeat.updatedAt).toBe(first.updatedAt);
    expect(await followUpCount(t)).toBe(2);

    const changed = await user.mutation(api.memoryApi.create, {
      ...args,
      content: "vhub hub page, edited",
    });
    expect(changed.id).toBe(first.id);
    expect(changed.content).toBe("vhub hub page, edited");
    expect(await followUpCount(t)).toBe(4);

    const listed = await user.action(api.memoryApi.listMemories, {
      profileId,
      limit: 10,
      offset: 0,
    });
    expect(listed.memories).toHaveLength(1);
  });
});
