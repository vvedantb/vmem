/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { browseKey } from "@vmem/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_browse_gate_user";
const PROFILE = "profile_browse";
const POST = "https://www.instagram.com/p/DeteNVUiIVE/";
const FOLLOW_UPS = [
  "memoryEmbed:embedMemoryInternal",
  "memoryExtract:extractMemoryEntitiesInternal",
];

type Harness = ReturnType<typeof convexTest>;

// what an old extension build sends: no externalId, "Visited N times" content
function oldWrite(title: string, url: string, visits = 1) {
  return {
    userId: USER,
    profileId: PROFILE,
    title,
    content: `${title}\n${url}\nVisited ${visits} times`,
    type: "episodic" as const,
    source: "browsing-history",
    sourceType: "browsing-history",
    tags: ["wwwinstagramcom"],
    confidence: 0.6,
    url,
  };
}

async function write(t: Harness, args: ReturnType<typeof oldWrite>) {
  return t.mutation(
    internal.memoryStore.functions.createOrUpsertMemoryInternal,
    args,
  );
}

async function rows(t: Harness) {
  return t.run((ctx) => ctx.db.query("memories").collect());
}

async function followUpCount(t: Harness) {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs.filter((job) => FOLLOW_UPS.includes(job.name)).length;
}

describe("browse write gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses five old-style Instagram variants into one row", async () => {
    const t = convexTest(schema, modules);
    for (const [index, query] of [
      "?utm_source=ig_embed&img_index=1",
      "?utm_source=ig_embed&img_index=2",
      "?img_index=3",
      "?img_index=4#c",
      "",
    ].entries()) {
      vi.advanceTimersByTime(1000);
      await write(t, oldWrite("Instagram", `${POST}${query}`, index + 1));
    }
    const stored = await rows(t);
    expect(stored).toHaveLength(1);
    const [row] = stored;
    expect(row?.visitCount).toBe(5);
    expect(row?.sourceId).toBe("url|https://instagram.com/p/DeteNVUiIVE");
    expect(row?.title).toBe("Instagram");
    expect(row?.content).toBe("Instagram\nhttps://instagram.com/p/DeteNVUiIVE");
  });

  it("collapses tracking-param variants of one search", async () => {
    const t = convexTest(schema, modules);
    const title = "red fish - Google Search";
    const first = await write(
      t,
      oldWrite(title, "https://www.google.com/search?q=red+fish&ei=a&ved=1"),
    );
    const second = await write(
      t,
      oldWrite(title, "https://www.google.com/search?q=red+fish&sxsrf=b"),
    );
    expect(second.memory.id).toBe(first.memory.id);
    expect(second.needsFollowUp).toBe(false);
    const stored = await rows(t);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.content).toBe("red fish - Google Search\ngoogle.com");
  });

  it("folds a refined search within 5 minutes into the earlier row", async () => {
    const t = convexTest(schema, modules);
    const first = await write(
      t,
      oldWrite(
        "red fish - Google Search",
        "https://www.google.com/search?q=red+fish",
      ),
    );
    vi.advanceTimersByTime(30_000);
    const refinedUrl = "https://www.google.com/search?q=red+fish+dish";
    const refined = await write(
      t,
      oldWrite("red fish dish - Google Search", refinedUrl),
    );
    expect(refined.memory.id).toBe(first.memory.id);
    const stored = await rows(t);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      title: "red fish dish - Google Search",
      url: refinedUrl,
      sourceId: "google.com|red fish dish - google search",
      visitCount: 2,
    });

    // a narrower query is not a refinement; a later one is outside the window
    await write(
      t,
      oldWrite("red - Google Search", "https://www.google.com/search?q=red"),
    );
    vi.advanceTimersByTime(6 * 60_000);
    await write(
      t,
      oldWrite(
        "red fish dish recipe - Google Search",
        "https://www.google.com/search?q=red+fish+dish+recipe",
      ),
    );
    expect(await rows(t)).toHaveLength(3);
  });

  it("bumps a recent keyless row with the same canonical url", async () => {
    const t = convexTest(schema, modules);
    // a row stored before the gate: no sourceId
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...oldWrite("Instagram", `${POST}?img_index=1`),
    });
    vi.advanceTimersByTime(60 * 60_000);
    await write(t, oldWrite("Instagram", `${POST}?img_index=5`));
    const stored = await rows(t);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.visitCount).toBe(2);
    expect(stored[0]?.sourceId).toBe("url|https://instagram.com/p/DeteNVUiIVE");
  });

  it("skips low-value pages without a row or follow-up jobs", async () => {
    const t = convexTest(schema, modules);
    for (const [title, url] of [
      ["Home / X", "https://x.com/home"],
      ["Instagram", "https://www.instagram.com/"],
      ["YouTube", "https://www.youtube.com/"],
      ["Sign in", "https://github.com/login"],
    ]) {
      const result = await write(t, oldWrite(title ?? "", url ?? ""));
      expect(result.needsFollowUp).toBe(false);
      expect(result.memory.skipped).toBe(true);
      expect(result.memory.id).toBe("");
    }
    expect(await rows(t)).toHaveLength(0);
    expect(await followUpCount(t)).toBe(0);
  });

  it("still upserts current-extension externalId writes", async () => {
    const t = convexTest(schema, modules);
    const url = `${POST}?img_index=2`;
    const args = {
      ...oldWrite("Some post title", url),
      content: "Some post title\ninstagram.com",
      externalId: browseKey({ url, title: "Some post title" }),
    };
    const first = await write(t, args);
    const repeat = await write(t, args);
    expect(repeat.memory.id).toBe(first.memory.id);
    expect(repeat.needsFollowUp).toBe(false);
    // an old build visiting the same page lands on the same row
    await write(t, oldWrite("Some post title", `${POST}?img_index=7`));
    const stored = await rows(t);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.visitCount).toBe(3);
    expect(stored[0]?.content).toBe("Some post title\ninstagram.com");
  });

  it("dedupes through memoryApi.createMemory end to end", async () => {
    const t = convexTest(schema, modules);
    registerAuditLog(t);
    const user = t.withIdentity({
      subject: USER,
      email: "browse@example.com",
      name: "browse@example.com",
    });
    await user.mutation(api.auth.ensureUserExists, {});
    const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
    if (!profile) throw new Error("profile missing");
    const { userId: _userId, ...base } = oldWrite(
      "Instagram",
      `${POST}?img_index=1`,
    );
    const args = { ...base, profileId: profile._id };
    const first = await user.action(api.memoryApi.createMemory, args);
    expect(await followUpCount(t)).toBe(1);
    const second = await user.action(api.memoryApi.createMemory, {
      ...args,
      url: `${POST}?img_index=2`,
      content: `Instagram\n${POST}?img_index=2\nVisited 2 times`,
    });
    expect(second.id).toBe(first.id);
    expect(await followUpCount(t)).toBe(1);
    const skipped = await user.action(api.memoryApi.createMemory, {
      ...args,
      title: "Home / X",
      url: "https://x.com/home",
    });
    expect(skipped.skipped).toBe(true);
    expect(await rows(t)).toHaveLength(1);
  });
});
