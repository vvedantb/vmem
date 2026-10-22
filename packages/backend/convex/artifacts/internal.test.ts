/// <reference types="vite/client" />
import { sha256Hex } from "@vvedantb/server";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FunctionArgs } from "convex/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("/convex/**/*.ts");
const START = Date.parse("2026-10-22T09:00:00Z");
const OLD = Date.parse("2026-03-01T10:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof setup>;
type ImportRow = FunctionArgs<
  typeof internal.artifacts.internal.importBatchInternal
>["rows"][number];

async function seedUser(t: Backend, clerkId: string): Promise<Id<"users">> {
  return await t.run(async (ctx) => await ctx.db.insert("users", { clerkId }));
}

const QUIZ = JSON.stringify({
  title: "Capitals",
  questions: [
    {
      id: "q1",
      prompt: "Capital of France?",
      options: ["Paris", "Rome"],
      correctIndex: 0,
    },
  ],
});

function htmlRow(externalId: string, body = `<p>${externalId}</p>`): ImportRow {
  return {
    title: `Doc ${externalId}`,
    type: "document",
    format: "html",
    schemaVersion: 1,
    body,
    createdAt: OLD,
    updatedAt: OLD + 1_000,
    origin: { client: "vibot", externalId },
    refs: [{ kind: "app", target: "vibot:project:p1" }],
  };
}

function quizRow(externalId: string): ImportRow {
  return {
    title: "Quiz",
    type: "quiz",
    format: "json",
    schemaVersion: 1,
    stateSpec: { stateVersion: 1, keys: ["answers"], template: "quiz" },
    body: QUIZ,
    createdAt: OLD,
    updatedAt: OLD + 2_000,
    origin: { client: "vibot", externalId },
    refs: [],
    versions: [
      {
        version: 1,
        title: "Quiz draft",
        body: QUIZ.replace("Rome", "Berlin"),
        createdAt: OLD,
      },
    ],
    state: { data: { answers: "[0]" }, updatedAt: OLD + 3_000 },
  };
}

async function tableCounts(t: Backend) {
  return await t.run(async (ctx) => ({
    users: (await ctx.db.query("users").collect()).length,
    artifacts: (await ctx.db.query("artifacts").collect()).length,
    artifactBodies: (await ctx.db.query("artifactBodies").collect()).length,
    artifactVersions: (await ctx.db.query("artifactVersions").collect()).length,
    artifactState: (await ctx.db.query("artifactState").collect()).length,
    artifactRefs: (await ctx.db.query("artifactRefs").collect()).length,
  }));
}

describe("artifacts importBatchInternal", () => {
  it("dry run reports counts and writes nothing", async () => {
    const t = setup();
    await seedUser(t, "clerk_v");
    const before = await tableCounts(t);
    const rows = [htmlRow("a1"), htmlRow("a2"), quizRow("q1")];
    const result = await t.mutation(
      internal.artifacts.internal.importBatchInternal,
      { clerkId: "clerk_v", dryRun: true, rows },
    );
    expect(result).toMatchObject({
      dryRun: true,
      created: 3,
      skipped: 0,
      invalid: 0,
      byType: { document: 2, quiz: 1 },
      conflicts: [],
    });
    // two html bodies + the quiz body and its older version
    const quizBytes =
      new TextEncoder().encode(QUIZ).length +
      new TextEncoder().encode(QUIZ.replace("Rome", "Berlin")).length;
    expect(result.totalBytes).toBe(
      "<p>a1</p>".length + "<p>a2</p>".length + quizBytes,
    );
    expect(result.rows.map((r) => r.status)).toEqual([
      "would_create",
      "would_create",
      "would_create",
    ]);
    expect(await tableCounts(t)).toEqual(before);
  });

  it("imports with source timestamps, versions, state and refs; a rerun is a no-op", async () => {
    const t = setup();
    await seedUser(t, "clerk_v");
    const rows = [htmlRow("a1"), quizRow("q1")];
    const first = await t.mutation(
      internal.artifacts.internal.importBatchInternal,
      { clerkId: "clerk_v", dryRun: false, rows },
    );
    expect(first).toMatchObject({ created: 2, skipped: 0, invalid: 0 });
    const after = await tableCounts(t);
    expect(after).toMatchObject({
      artifacts: 2,
      artifactBodies: 3,
      artifactVersions: 3,
      artifactState: 1,
      artifactRefs: 1,
    });

    const v = t.withIdentity({ subject: "clerk_v" });
    const quiz = await v.query(api.artifacts.api.get, {
      client: "vibot",
      externalId: "q1",
    });
    expect(quiz).toMatchObject({
      body: QUIZ,
      currentVersion: 2,
      createdAt: OLD,
      updatedAt: OLD + 2_000,
    });
    const id = quiz?.id ?? "";
    const history = await v.query(api.artifacts.api.history, { id });
    expect(history.map((h) => [h.version, h.title, h.createdBy])).toEqual([
      [2, "Quiz", "vibot"],
      [1, "Quiz draft", "vibot"],
    ]);
    expect(await v.query(api.artifacts.api.getState, { id })).toMatchObject({
      data: { answers: "[0]" },
      updatedAt: OLD + 3_000,
    });
    const doc = await v.query(api.artifacts.api.get, {
      client: "vibot",
      externalId: "a1",
    });
    expect(
      await v.query(api.artifacts.api.refs, { id: doc?.id ?? "" }),
    ).toMatchObject([{ kind: "app", target: "vibot:project:p1" }]);

    const rerun = await t.mutation(
      internal.artifacts.internal.importBatchInternal,
      { clerkId: "clerk_v", dryRun: false, rows },
    );
    expect(rerun).toMatchObject({ created: 0, skipped: 2, totalBytes: 0 });
    expect(rerun.rows.map((r) => r.status)).toEqual(["exists", "exists"]);
    expect(await tableCounts(t)).toEqual(after);
  });

  it("treats a matching newest version as the current version", async () => {
    const t = setup();
    await seedUser(t, "clerk_v");
    const row = {
      ...htmlRow("a1", "<p>now</p>"),
      versions: [
        { version: 1, title: "Doc a1", body: "<p>old</p>", createdAt: OLD },
        { version: 2, title: "Doc a1", body: "<p>now</p>", createdAt: OLD + 5 },
      ],
    };
    await t.mutation(internal.artifacts.internal.importBatchInternal, {
      clerkId: "clerk_v",
      dryRun: false,
      rows: [row],
    });
    expect(await tableCounts(t)).toMatchObject({
      artifactBodies: 2,
      artifactVersions: 2,
    });
    const doc = await t
      .withIdentity({ subject: "clerk_v" })
      .query(api.artifacts.api.get, { client: "vibot", externalId: "a1" });
    expect(doc?.currentVersion).toBe(2);
  });

  it("reports an unknown clerkId as a conflict and creates no user", async () => {
    const t = setup();
    await seedUser(t, "clerk_v");
    const result = await t.mutation(
      internal.artifacts.internal.importBatchInternal,
      { clerkId: "clerk_other", dryRun: false, rows: [htmlRow("a1")] },
    );
    expect(result.created).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain("clerk_other");
    expect(await tableCounts(t)).toMatchObject({ users: 1, artifacts: 0 });
  });

  it("reports invalid rows and imports the rest", async () => {
    const t = setup();
    await seedUser(t, "clerk_v");
    const badQuiz = { ...quizRow("q1"), body: '{"title":"x"}' };
    const badVersion = {
      ...quizRow("q2"),
      versions: [
        { version: 1, title: "Old", body: "not json", createdAt: OLD },
      ],
    };
    const result = await t.mutation(
      internal.artifacts.internal.importBatchInternal,
      {
        clerkId: "clerk_v",
        dryRun: false,
        rows: [badQuiz, badVersion, htmlRow("a1"), htmlRow("a1")],
      },
    );
    expect(result).toMatchObject({ created: 1, invalid: 3 });
    expect(result.rows.map((r) => [r.externalId, r.status])).toEqual([
      ["q1", "invalid"],
      ["q2", "invalid"],
      ["a1", "created"],
      ["a1", "invalid"],
    ]);
    expect(result.rows[1]?.error).toMatch(/^version 1: /);
    expect(result.rows[3]?.error).toBe("Duplicate origin in batch");
    expect(await tableCounts(t)).toMatchObject({ artifacts: 1 });
  });

  it("rejects batches over 50 rows", async () => {
    const t = setup();
    await seedUser(t, "clerk_v");
    const rows = Array.from({ length: 51 }, (_, i) => htmlRow(`a${String(i)}`));
    await expect(
      t.mutation(internal.artifacts.internal.importBatchInternal, {
        clerkId: "clerk_v",
        dryRun: true,
        rows,
      }),
    ).rejects.toThrow(/at most 50/);
  });
});

describe("artifacts verifyImportInternal", () => {
  it("returns the sha256 of each current body for the source compare", async () => {
    const t = setup();
    const userId = await seedUser(t, "clerk_v");
    const rows = [htmlRow("a1"), quizRow("q1")];
    await t.mutation(internal.artifacts.internal.importBatchInternal, {
      clerkId: "clerk_v",
      dryRun: false,
      rows,
    });
    // a non-imported row from the same client is not listed
    await t.run(async (ctx) => {
      const bodyId = await ctx.db.insert("artifactBodies", {
        userId,
        body: "x",
        sha256: "x",
        createdAt: START,
      });
      await ctx.db.insert("artifacts", {
        userId,
        title: "Native",
        type: "document",
        format: "markdown",
        schemaVersion: 1,
        currentVersion: 1,
        currentBodyId: bodyId,
        size: 1,
        searchText: "Native",
        origin: { client: "vibot" },
        createdAt: START,
        updatedAt: START,
      });
    });

    const result = await t.query(
      internal.artifacts.internal.verifyImportInternal,
      { clerkId: "clerk_v", client: "vibot" },
    );
    expect(result.isDone).toBe(true);
    expect(result.count).toBe(2);
    const expected = await Promise.all(
      rows.map(async (row) => ({
        externalId: row.origin.externalId,
        sha256: await sha256Hex(row.body),
      })),
    );
    expect(
      result.items
        .map(({ externalId, sha256 }) => ({ externalId, sha256 }))
        .sort((a, b) => a.externalId.localeCompare(b.externalId)),
    ).toEqual(expected);
    expect(result.items.find((i) => i.externalId === "q1")).toMatchObject({
      versions: 2,
      hasState: true,
    });
    expect(result.items.find((i) => i.externalId === "a1")).toMatchObject({
      versions: 1,
      hasState: false,
    });
  });
});

describe("artifacts listSinceInternal", () => {
  it("returns this client's rows updated after `since`, with bodies", async () => {
    const t = setup();
    await seedUser(t, "clerk_v");
    await t.mutation(internal.artifacts.internal.importBatchInternal, {
      clerkId: "clerk_v",
      dryRun: false,
      rows: [htmlRow("old1")],
    });
    const switchAt = START - DAY_MS;
    await t.mutation(internal.artifacts.internal.importBatchInternal, {
      clerkId: "clerk_v",
      dryRun: false,
      rows: [
        {
          ...htmlRow("new1"),
          createdAt: switchAt + 10,
          updatedAt: switchAt + 20,
        },
        {
          ...htmlRow("web1"),
          origin: { client: "web", externalId: "web1" },
          createdAt: switchAt + 10,
          updatedAt: switchAt + 20,
        },
      ],
    });
    const result = await t.query(
      internal.artifacts.internal.listSinceInternal,
      { clerkId: "clerk_v", client: "vibot", since: switchAt },
    );
    expect(result.isDone).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      externalId: "new1",
      body: "<p>new1</p>",
      refs: [{ kind: "app", target: "vibot:project:p1" }],
      updatedAt: switchAt + 20,
    });
  });
});

describe("artifacts removeImportedInternal", () => {
  it("dry run counts; a real run hard-deletes only this user's rows from this client", async () => {
    const t = setup();
    await seedUser(t, "clerk_v");
    await seedUser(t, "clerk_w");
    const importFor = async (clerkId: string, rows: ImportRow[]) =>
      await t.mutation(internal.artifacts.internal.importBatchInternal, {
        clerkId,
        dryRun: false,
        rows,
      });
    await importFor("clerk_v", [htmlRow("a1"), htmlRow("a2"), htmlRow("a3")]);
    await importFor("clerk_v", [
      { ...htmlRow("w1"), origin: { client: "web", externalId: "w1" } },
    ]);
    await importFor("clerk_w", [htmlRow("a1")]);
    await t.mutation(internal.artifacts.internal.importBatchInternal, {
      clerkId: "clerk_v",
      dryRun: false,
      rows: [quizRow("q1")],
    });
    // the user's own (non-imported) vibot row stays
    const own = await t
      .withIdentity({ subject: "clerk_v" })
      .mutation(api.artifacts.api.create, {
        title: "Own",
        type: "document",
        format: "html",
        body: "<p>own</p>",
        origin: { client: "vibot" },
      });
    const before = await tableCounts(t);

    const dry = await t.mutation(
      internal.artifacts.internal.removeImportedInternal,
      { clerkId: "clerk_v", client: "vibot" },
    );
    expect(dry).toEqual({ dryRun: true, matched: 4, deleted: 0, more: false });
    expect(await tableCounts(t)).toEqual(before);

    await t.mutation(internal.artifacts.internal.removeImportedInternal, {
      clerkId: "clerk_v",
      client: "vibot",
      dryRun: false,
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    const left = await t.run(async (ctx) =>
      (await ctx.db.query("artifacts").collect()).map((doc) => [
        doc.origin.client,
        doc.origin.externalId ?? doc._id,
      ]),
    );
    expect(left).toHaveLength(3);
    expect(left).toContainEqual(["web", "w1"]);
    expect(left).toContainEqual(["vibot", own.id]);
    expect(left).toContainEqual(["vibot", "a1"]);
    // children of deleted rows are gone too: 3 artifacts, 1 body/version each
    expect(await tableCounts(t)).toMatchObject({
      artifacts: 3,
      artifactBodies: 3,
      artifactVersions: 3,
      artifactState: 0,
      artifactRefs: 2,
    });
    const afterDry = await t.mutation(
      internal.artifacts.internal.removeImportedInternal,
      { clerkId: "clerk_v", client: "vibot" },
    );
    expect(afterDry.matched).toBe(0);
  });
});
