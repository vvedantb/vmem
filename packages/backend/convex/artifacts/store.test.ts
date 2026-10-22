/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id, TableNames } from "../_generated/dataModel";
import schema from "../schema";
import {
  ARTIFACT_STATE_DAILY_CAP,
  ARTIFACT_TRASH_MS,
  listArtifacts,
} from "./store";

const modules = import.meta.glob("/convex/**/*.ts");
const START = Date.parse("2026-10-22T09:00:00Z");
const PAGE = { numItems: 50, cursor: null };

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof setup>;

async function seedUsers(t: Backend, clerkIds: string[]) {
  return await t.run(async (ctx) => {
    const ids: Array<Id<"users">> = [];
    for (const clerkId of clerkIds) {
      ids.push(await ctx.db.insert("users", { clerkId }));
    }
    return ids;
  });
}

async function seedTeam(t: Backend, members: Array<Id<"users">>) {
  return await t.run(async (ctx) => {
    const [owner, ...rest] = members;
    if (owner === undefined) throw new Error("team needs an owner");
    const teamId = await ctx.db.insert("teams", {
      name: "Team",
      createdBy: owner,
      createdAt: START,
      updatedAt: START,
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userId: owner,
      role: "owner",
      joinedAt: START,
    });
    for (const userId of rest) {
      await ctx.db.insert("teamMembers", {
        teamId,
        userId,
        role: "member",
        joinedAt: START,
      });
    }
    return teamId;
  });
}

function as(t: Backend, clerkId: string) {
  return t.withIdentity({ subject: clerkId });
}

function htmlArgs(
  body: string,
  title = "Doc",
): { title: string; type: "document"; format: "html"; body: string } {
  return { title, type: "document", format: "html", body };
}

async function countRows(
  t: Backend,
  table: "artifactBodies" | "artifactVersions",
) {
  return await t.run(
    async (ctx) => (await ctx.db.query(table).collect()).length,
  );
}

function tick(ms = 1_000) {
  vi.setSystemTime(Date.now() + ms);
}

describe("artifacts create / update / versions", () => {
  it("adds a version per change, dedupes bodies and restores old versions", async () => {
    const t = setup();
    await seedUsers(t, ["clerk_a"]);
    const a = as(t, "clerk_a");
    const { id, created } = await a.mutation(
      api.artifacts.api.create,
      htmlArgs("<p>alpha</p>"),
    );
    expect(created).toBe(true);

    tick();
    expect(
      await a.mutation(api.artifacts.api.update, { id, body: "<p>beta</p>" }),
    ).toEqual({ version: 2, versioned: true });
    // title only: a version, no body
    tick();
    expect(
      await a.mutation(api.artifacts.api.update, { id, title: "Renamed" }),
    ).toEqual({ version: 3, versioned: true });
    expect(await countRows(t, "artifactBodies")).toBe(2);
    // description only: no version
    expect(
      await a.mutation(api.artifacts.api.update, { id, description: "about" }),
    ).toEqual({ version: 3, versioned: false });
    // same body text: no version, no body
    expect(
      await a.mutation(api.artifacts.api.update, { id, body: "<p>beta</p>" }),
    ).toEqual({ version: 3, versioned: false });

    const restored = await a.mutation(api.artifacts.api.restoreVersion, {
      id,
      version: 1,
    });
    expect(restored).toEqual({ version: 4, versioned: true });
    expect(await countRows(t, "artifactBodies")).toBe(2);

    const current = await a.query(api.artifacts.api.get, { id });
    expect(current).toMatchObject({
      body: "<p>alpha</p>",
      title: "Doc",
      description: "about",
      currentVersion: 4,
      version: 4,
      size: 12,
    });
    const v2 = await a.query(api.artifacts.api.getVersion, { id, version: 2 });
    expect(v2?.body).toBe("<p>beta</p>");
    const history = await a.query(api.artifacts.api.history, { id });
    expect(history.map((h) => [h.version, h.title])).toEqual([
      [4, "Doc"],
      [3, "Renamed"],
      [2, "Doc"],
      [1, "Doc"],
    ]);
  });

  it("keeps 10 versions and deletes bodies no kept row points at", async () => {
    const t = setup();
    await seedUsers(t, ["clerk_a"]);
    const a = as(t, "clerk_a");
    const { id } = await a.mutation(api.artifacts.api.create, htmlArgs("A"));
    await a.mutation(api.artifacts.api.update, { id, body: "B" });
    // v3 points at body A again (deduped)
    await a.mutation(api.artifacts.api.update, { id, body: "A" });
    for (let i = 0; i < 8; i += 1) {
      await a.mutation(api.artifacts.api.update, { id, body: `C${String(i)}` });
    }
    // 11 versions written: v1 pruned, body A kept for v3
    const bodies = async () =>
      await t.run(async (ctx) =>
        (await ctx.db.query("artifactBodies").collect()).map((b) => b.body),
      );
    expect(await countRows(t, "artifactVersions")).toBe(10);
    expect(await bodies()).toContain("A");
    expect(await bodies()).toContain("B");

    // v2 pruned: body B is an orphan now
    await a.mutation(api.artifacts.api.update, { id, body: "D" });
    expect(await countRows(t, "artifactVersions")).toBe(10);
    expect(await bodies()).not.toContain("B");
    expect(await bodies()).toContain("A");
    expect(
      await a.query(api.artifacts.api.getVersion, { id, version: 2 }),
    ).toBeNull();

    // v3 pruned: body A goes too
    await a.mutation(api.artifacts.api.update, { id, body: "E" });
    expect(await bodies()).not.toContain("A");
    expect(await countRows(t, "artifactBodies")).toBe(10);
  });

  it("validates json bodies with the shared schemas", async () => {
    const t = setup();
    await seedUsers(t, ["clerk_a"]);
    const a = as(t, "clerk_a");
    const quiz = {
      title: "Capitals",
      questions: [
        {
          id: "q1",
          prompt: "Capital of France?",
          options: ["Paris", "Rome"],
          correctIndex: 0,
        },
      ],
    };
    const ok = await a.mutation(api.artifacts.api.create, {
      title: "Quiz",
      type: "quiz",
      format: "json",
      body: JSON.stringify(quiz),
      stateSpec: { stateVersion: 1, keys: ["answers"], template: "quiz" },
    });
    expect(ok.created).toBe(true);
    // quiz text is searchable
    const hits = await a.query(api.artifacts.api.search, { q: "France" });
    expect(hits.map((h) => h.id)).toEqual([ok.id]);

    await expect(
      a.mutation(api.artifacts.api.create, {
        title: "Bad quiz",
        type: "quiz",
        format: "json",
        body: JSON.stringify({
          ...quiz,
          questions: [{ ...quiz.questions[0], correctIndex: 5 }],
        }),
      }),
    ).rejects.toThrow();
    await expect(
      a.mutation(api.artifacts.api.create, {
        title: "Not json",
        type: "quiz",
        format: "json",
        body: "{nope",
      }),
    ).rejects.toThrow();
    await expect(
      a.mutation(api.artifacts.api.create, {
        title: "Json doc",
        type: "document",
        format: "json",
        body: "{}",
      }),
    ).rejects.toThrow();
    await expect(
      a.mutation(api.artifacts.api.update, {
        id: ok.id,
        body: '{"title":"x"}',
      }),
    ).rejects.toThrow();
    expect(await countRows(t, "artifactBodies")).toBe(1);
  });

  it("gets by origin externalId and creates idempotently by origin", async () => {
    const t = setup();
    await seedUsers(t, ["clerk_a", "clerk_b"]);
    const a = as(t, "clerk_a");
    const origin = { client: "vibot", externalId: "old_1" };
    const first = await a.mutation(api.artifacts.api.create, {
      ...htmlArgs("<p>x</p>"),
      origin,
    });
    const again = await a.mutation(api.artifacts.api.create, {
      ...htmlArgs("<p>other</p>"),
      origin,
    });
    expect(again).toEqual({ id: first.id, created: false });

    const byOrigin = await a.query(api.artifacts.api.get, {
      client: "vibot",
      externalId: "old_1",
    });
    expect(byOrigin).toMatchObject({ id: first.id, body: "<p>x</p>", origin });
    // origin lookups are per user
    expect(
      await as(t, "clerk_b").query(api.artifacts.api.get, {
        client: "vibot",
        externalId: "old_1",
      }),
    ).toBeNull();
  });
});

describe("artifacts list and scope", () => {
  it("never reads artifactBodies when listing", async () => {
    const t = setup();
    const [userId] = await seedUsers(t, ["clerk_a"]);
    if (userId === undefined) throw new Error("seed failed");
    const a = as(t, "clerk_a");
    const { id } = await a.mutation(
      api.artifacts.api.create,
      htmlArgs("<p>1</p>"),
    );
    await a.mutation(api.artifacts.api.create, htmlArgs("<p>2</p>"));
    await a.mutation(api.artifacts.api.link, {
      id,
      kind: "app",
      target: "vibot:project:1",
    });

    await t.run(async (ctx) => {
      const tables: TableNames[] = [];
      const bodyIds = new Set<string>(
        (await ctx.db.query("artifactBodies").collect()).map((b) => b._id),
      );
      const gotIds: string[] = [];
      // record every table queried and every body id fetched by id
      const db = {
        ...ctx.db,
        query: new Proxy(ctx.db.query.bind(ctx.db), {
          apply(query, self, args) {
            tables.push(...args);
            return Reflect.apply(query, self, args);
          },
        }),
        get: new Proxy(ctx.db.get.bind(ctx.db), {
          apply(get, self, args) {
            gotIds.push(...args);
            return Reflect.apply(get, self, args);
          },
        }),
      };
      const spied = { ...ctx, db };
      const all = await listArtifacts(spied, { userId, paginationOpts: PAGE });
      expect(all.page).toHaveLength(2);
      expect(all.page[0]).not.toHaveProperty("body");
      const linked = await listArtifacts(spied, {
        userId,
        ref: { kind: "app", target: "vibot:project:1" },
        paginationOpts: PAGE,
      });
      expect(linked.page.map((row) => row.id)).toEqual([id]);
      // the spy sees reads: artifacts and refs, the linked row by id
      expect(tables).toEqual(
        expect.arrayContaining(["artifacts", "artifactRefs"]),
      );
      expect(gotIds).toContain(id);
      expect(tables).not.toContain("artifactBodies");
      expect(gotIds.filter((docId) => bodyIds.has(docId))).toEqual([]);
    });
  });

  it("isolates other users and keeps team artifacts out of personal lists", async () => {
    const t = setup();
    const [ownerId, memberId] = await seedUsers(t, [
      "clerk_a",
      "clerk_b",
      "clerk_c",
    ]);
    if (ownerId === undefined || memberId === undefined)
      throw new Error("seed failed");
    const teamId = await seedTeam(t, [ownerId, memberId]);
    const a = as(t, "clerk_a");
    const b = as(t, "clerk_b");
    const c = as(t, "clerk_c");

    const personal = await a.mutation(
      api.artifacts.api.create,
      htmlArgs("<p>mine</p>", "Mine"),
    );
    const shared = await a.mutation(api.artifacts.api.create, {
      ...htmlArgs("<p>ours</p>", "Ours"),
      teamId,
    });

    const aPersonal = await a.query(api.artifacts.api.list, {
      paginationOpts: PAGE,
    });
    expect(aPersonal.page.map((r) => r.id)).toEqual([personal.id]);
    const bTeam = await b.query(api.artifacts.api.list, {
      teamId,
      paginationOpts: PAGE,
    });
    expect(bTeam.page.map((r) => r.id)).toEqual([shared.id]);
    const bPersonal = await b.query(api.artifacts.api.list, {
      paginationOpts: PAGE,
    });
    expect(bPersonal.page).toEqual([]);

    // other users: missing, not forbidden
    expect(
      await b.query(api.artifacts.api.get, { id: personal.id }),
    ).toBeNull();
    expect(await c.query(api.artifacts.api.get, { id: shared.id })).toBeNull();
    await expect(
      b.mutation(api.artifacts.api.update, { id: personal.id, title: "x" }),
    ).rejects.toThrow();
    await expect(
      c.query(api.artifacts.api.list, { teamId, paginationOpts: PAGE }),
    ).rejects.toThrow();
    expect(await b.query(api.artifacts.api.search, { q: "mine" })).toEqual([]);
    expect(
      (await b.query(api.artifacts.api.search, { q: "ours", teamId })).map(
        (r) => r.id,
      ),
    ).toEqual([shared.id]);

    // team members edit; only the creator or an owner deletes
    await b.mutation(api.artifacts.api.update, {
      id: shared.id,
      body: "<p>edited</p>",
    });
    const mineByB = await b.mutation(api.artifacts.api.create, {
      ...htmlArgs("<p>b</p>", "B's"),
      teamId,
    });
    await a.mutation(api.artifacts.api.remove, { id: mineByB.id });
    await expect(
      b.mutation(api.artifacts.api.remove, { id: shared.id }),
    ).rejects.toThrow();

    // state is per member
    await a.mutation(api.artifacts.api.putState, {
      id: shared.id,
      sets: { score: "3" },
    });
    expect(
      await b.query(api.artifacts.api.getState, { id: shared.id }),
    ).toBeNull();
  });
});

describe("artifacts state", () => {
  it("enforces the write interval, shared limits and the daily cap", async () => {
    const t = setup();
    await seedUsers(t, ["clerk_a"]);
    const a = as(t, "clerk_a");
    const { id } = await a.mutation(
      api.artifacts.api.create,
      htmlArgs("<p>q</p>"),
    );

    const first = await a.mutation(api.artifacts.api.putState, {
      id,
      sets: { score: "1", answers: "[0]" },
    });
    expect(first.data).toEqual({ score: "1", answers: "[0]" });
    await expect(
      a.mutation(api.artifacts.api.putState, { id, sets: { score: "2" } }),
    ).rejects.toThrow(/one per second/);

    tick();
    const second = await a.mutation(api.artifacts.api.putState, {
      id,
      sets: { score: "2" },
      removes: ["answers"],
    });
    expect(second.data).toEqual({ score: "2" });

    tick();
    await expect(
      a.mutation(api.artifacts.api.putState, {
        id,
        sets: { big: "x".repeat(17 * 1024) },
      }),
    ).rejects.toThrow();
    const tooMany: Record<string, string> = {};
    for (let i = 0; i < 33; i += 1) tooMany[`k${String(i)}`] = "v";
    await expect(
      a.mutation(api.artifacts.api.putState, { id, sets: tooMany }),
    ).rejects.toThrow();
    await expect(
      a.mutation(api.artifacts.api.putState, { id, sets: { clé: "v" } }),
    ).rejects.toThrow(/Field name/);
    // rejected writes leave the data alone
    expect((await a.query(api.artifacts.api.getState, { id }))?.data).toEqual({
      score: "2",
    });

    // daily cap
    await t.run(async (ctx) => {
      const row = await ctx.db.query("artifactState").first();
      if (!row) throw new Error("no state row");
      await ctx.db.patch(row._id, {
        dailyWriteCount: ARTIFACT_STATE_DAILY_CAP,
      });
    });
    await expect(
      a.mutation(api.artifacts.api.putState, { id, sets: { score: "3" } }),
    ).rejects.toThrow(/Daily/);
    tick(24 * 60 * 60 * 1000);
    const reset = await a.mutation(api.artifacts.api.resetState, { id });
    expect(reset.data).toEqual({});
  });
});

describe("artifacts trash", () => {
  it("hides soft-deleted rows, restores them, and purges after 30 days", async () => {
    const t = setup();
    await seedUsers(t, ["clerk_a"]);
    const a = as(t, "clerk_a");
    const kept = await a.mutation(
      api.artifacts.api.create,
      htmlArgs("<p>keep</p>", "Keep"),
    );
    const { id } = await a.mutation(
      api.artifacts.api.create,
      htmlArgs("<p>gone</p>", "Gone"),
    );
    await a.mutation(api.artifacts.api.update, { id, body: "<p>gone 2</p>" });
    await a.mutation(api.artifacts.api.putState, { id, sets: { s: "1" } });
    await a.mutation(api.artifacts.api.link, {
      id,
      kind: "memory",
      target: "mem_1",
    });

    await a.mutation(api.artifacts.api.remove, { id });
    const live = await a.query(api.artifacts.api.list, {
      paginationOpts: PAGE,
    });
    expect(live.page.map((r) => r.id)).toEqual([kept.id]);
    expect(await a.query(api.artifacts.api.search, { q: "gone" })).toEqual([]);
    const withTrash = await a.query(api.artifacts.api.list, {
      includeDeleted: true,
      paginationOpts: PAGE,
    });
    expect(withTrash.page).toHaveLength(2);
    await expect(
      a.mutation(api.artifacts.api.update, { id, title: "x" }),
    ).rejects.toThrow(/trash/);

    await a.mutation(api.artifacts.api.restore, { id });
    expect(
      (await a.query(api.artifacts.api.list, { paginationOpts: PAGE })).page,
    ).toHaveLength(2);
    await a.mutation(api.artifacts.api.remove, { id });

    // inside the window: nothing purged
    tick(ARTIFACT_TRASH_MS - 60_000);
    expect(
      await t.mutation(internal.artifacts.internal.purgeDeletedInternal, {}),
    ).toBe(false);
    expect(await countRows(t, "artifactBodies")).toBe(3);

    // past the window: the hourly trace sweep purges it with its children
    tick(120_000);
    await t.mutation(internal.mcpTraces.purgeExpired, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await t.run(async (ctx) => ({
      artifacts: (await ctx.db.query("artifacts").collect()).map((r) => r._id),
      bodies: (await ctx.db.query("artifactBodies").collect()).length,
      versions: (await ctx.db.query("artifactVersions").collect()).length,
      state: (await ctx.db.query("artifactState").collect()).length,
      refs: (await ctx.db.query("artifactRefs").collect()).length,
    }));
    expect(left).toEqual({
      artifacts: [kept.id],
      bodies: 1,
      versions: 1,
      state: 0,
      refs: 0,
    });
  });
});
