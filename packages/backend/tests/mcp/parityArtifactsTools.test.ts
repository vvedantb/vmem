import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseArtifactRef } from "../../convex/mcp/toolsArtifacts";
import { registerTools } from "../../convex/mcp/tools";
import {
  ARTIFACTS_TOOL_NAMES,
  catalogNamesForScope,
  READ_ONLY_ARTIFACTS_TOOL_NAMES,
} from "./catalog";
import { createConvexBackend, mcpCaller, signUp } from "./convexHarness";
import {
  createMockActionCtx,
  createMockStore,
  MOCK_CLERK_ID,
} from "./mockBackend";

const ALICE = "clerk_artifacts_alice";
const BOB = "clerk_artifacts_bob";

const savedSchema = z.object({ id: z.string(), created: z.boolean() });
const rowSchema = z
  .object({ id: z.string(), title: z.string(), currentVersion: z.number() })
  .passthrough();
const rowsSchema = z.array(rowSchema);
const refRowSchema = z.object({ kind: z.string(), target: z.string() });
const linkedSchema = z.object({ refs: z.array(refRowSchema) });
const historySchema = z.object({
  currentVersion: z.number(),
  versions: z.array(z.object({ version: z.number(), createdBy: z.string() })),
});
const listSchema = z.object({
  artifacts: z.array(rowSchema),
  nextCursor: z.string().nullable(),
});
const detailSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    version: z.number(),
    bodyChars: z.number(),
    truncated: z.boolean().optional(),
    body: z.string().optional(),
    deletedAt: z.number().optional(),
    refs: z.array(refRowSchema),
  })
  .passthrough();
const stateSchema = z.object({
  data: z.record(z.string(), z.string()),
  stateVersion: z.number(),
});
const teamCreatedSchema = z.object({ teamId: z.string() });

function html(title: string, body: string) {
  return { title, type: "document", format: "html", body };
}

async function listIds(
  caller: ReturnType<typeof mcpCaller>,
  args: Record<string, unknown> = {},
): Promise<string[]> {
  const listed = listSchema.parse(await caller.call("artifacts_list", args));
  return listed.artifacts.map((row) => row.id);
}

describe("MCP artifacts tools", () => {
  it("registers all 14 tools on both scopes with read-only hints on reads", async () => {
    expect(ARTIFACTS_TOOL_NAMES).toHaveLength(14);
    for (const scope of ["personal", "team"] as const) {
      const server = new McpServer({ name: "test", version: "0.0.0" });
      registerTools(
        server,
        MOCK_CLERK_ID,
        createMockActionCtx(createMockStore()),
        scope,
      );
      const client = new Client({ name: "test-client", version: "0.0.0" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const { tools } = await client.listTools();
      const readOnly: readonly string[] = READ_ONLY_ARTIFACTS_TOOL_NAMES;
      for (const name of ARTIFACTS_TOOL_NAMES) {
        const tool = tools.find((entry) => entry.name === name);
        expect(tool, `${scope} ${name}`).toBeDefined();
        expect(tool?.annotations?.readOnlyHint === true).toBe(
          readOnly.includes(name),
        );
      }
      expect(catalogNamesForScope(scope)).toEqual(
        expect.arrayContaining([...ARTIFACTS_TOOL_NAMES]),
      );
      await client.close();
    }
  });

  it("parses string refs and rejects unknown kinds", () => {
    expect(parseArtifactRef("app:vibot:project:42")).toEqual({
      kind: "app",
      target: "vibot:project:42",
    });
    expect(parseArtifactRef({ kind: "memory", target: "m1" })).toEqual({
      kind: "memory",
      target: "m1",
    });
    expect(() => parseArtifactRef("app")).toThrow(/Invalid ref/);
    expect(() => parseArtifactRef("app:")).toThrow(/Invalid ref/);
    expect(() => parseArtifactRef("project:42")).toThrow(/Invalid ref/);
  });

  it("saves, reads, cuts, versions, links and never lists bodies", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    const alice = mcpCaller(t, ALICE);

    const body = `<h1>Plan</h1><p>${"word ".repeat(100)}</p>`;
    const saved = savedSchema.parse(
      await alice.call("artifacts_save", {
        ...html("Plan", body),
        description: "Launch plan",
        refs: ["app:vibot:project:1", { kind: "memory", target: "m1" }],
        origin: { client: "vibot", externalId: "old-1" },
      }),
    );
    expect(saved.created).toBe(true);
    // same origin returns the existing artifact
    expect(
      savedSchema.parse(
        await alice.call("artifacts_save", {
          ...html("Plan again", "<p>x</p>"),
          origin: { client: "vibot", externalId: "old-1" },
        }),
      ),
    ).toEqual({ id: saved.id, created: false });

    // list rows are metadata only
    const listed = listSchema.parse(await alice.call("artifacts_list"));
    expect(listed.artifacts.map((row) => row.id)).toEqual([saved.id]);
    expect(listed.nextCursor).toBeNull();
    for (const row of listed.artifacts) {
      expect(row).not.toHaveProperty("body");
      expect(row).not.toHaveProperty("searchText");
    }
    expect(await listIds(alice, { ref: "app:vibot:project:1" })).toEqual([
      saved.id,
    ]);
    expect(await listIds(alice, { ref: "app:vibot:project:2" })).toEqual([]);
    expect(await listIds(alice, { type: "quiz" })).toEqual([]);

    // get by externalId, with the body cut to maxChars
    const cut = detailSchema.parse(
      await alice.call("artifacts_get", {
        client: "vibot",
        externalId: "old-1",
        maxChars: 12,
      }),
    );
    expect(cut).toMatchObject({
      id: saved.id,
      version: 1,
      bodyChars: body.length,
      truncated: true,
      body: body.slice(0, 12),
    });
    expect(cut.refs.map((ref) => `${ref.kind}:${ref.target}`).sort()).toEqual([
      "app:vibot:project:1",
      "memory:m1",
    ]);
    const full = detailSchema.parse(
      await alice.call("artifacts_get", { id: saved.id }),
    );
    expect(full).toMatchObject({ body, truncated: false });
    const meta = detailSchema.parse(
      await alice.call("artifacts_get", { id: saved.id, includeBody: false }),
    );
    expect(meta).not.toHaveProperty("body");
    expect(meta.bodyChars).toBe(body.length);
    expect(
      await alice.call("artifacts_get", {
        client: "vibot",
        externalId: "nope",
      }),
    ).toBeNull();
    await expect(alice.call("artifacts_get", {})).rejects.toThrow(
      /Pass id, or client and externalId/,
    );

    // search is fts over the plain text
    const hits = rowsSchema.parse(
      await alice.call("artifacts_search", { query: "Launch" }),
    );
    expect(hits.map((row) => row.id)).toEqual([saved.id]);
    expect(hits[0]).not.toHaveProperty("body");

    // a new body is a new version; history, version_get, restore_version
    expect(
      await alice.call("artifacts_update", {
        id: saved.id,
        body: "<p>v2</p>",
      }),
    ).toEqual({ id: saved.id, version: 2, versioned: true });
    const history = historySchema.parse(
      await alice.call("artifacts_history", { id: saved.id }),
    );
    expect(history.currentVersion).toBe(2);
    expect(history.versions).toEqual([
      expect.objectContaining({ version: 2, createdBy: "mcp" }),
      expect.objectContaining({ version: 1, createdBy: "vibot" }),
    ]);
    expect(
      detailSchema.parse(
        await alice.call("artifacts_version_get", {
          id: saved.id,
          version: 1,
          maxChars: 4,
        }),
      ),
    ).toMatchObject({ version: 1, body: "<h1>", truncated: true });
    expect(
      await alice.call("artifacts_restore_version", {
        id: saved.id,
        version: 1,
      }),
    ).toEqual({ id: saved.id, version: 3, versioned: true });
    expect(
      detailSchema.parse(await alice.call("artifacts_get", { id: saved.id })),
    ).toMatchObject({ version: 3, body });

    // links
    const linked = linkedSchema.parse(
      await alice.call("artifacts_link", {
        id: saved.id,
        add: ["file:f1"],
        remove: ["memory:m1"],
      }),
    );
    expect(
      linked.refs.map((ref) => `${ref.kind}:${ref.target}`).sort(),
    ).toEqual(["app:vibot:project:1", "file:f1"]);
    await expect(
      alice.call("artifacts_link", { id: saved.id, add: ["project:1"] }),
    ).rejects.toThrow(/Invalid ref/);
  });

  it("rejects invalid json bodies", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    const alice = mcpCaller(t, ALICE);
    const quiz = {
      title: "Capitals",
      questions: [
        {
          id: "q1",
          prompt: "France?",
          options: ["Paris", "Rome"],
          correctIndex: 0,
        },
      ],
    };
    const ok = savedSchema.parse(
      await alice.call("artifacts_save", {
        title: "Quiz",
        type: "quiz",
        format: "json",
        body: JSON.stringify(quiz),
        stateSpec: { stateVersion: 1, keys: ["answers"], template: "quiz" },
      }),
    );
    expect(ok.created).toBe(true);
    await expect(
      alice.call("artifacts_save", {
        title: "Bad quiz",
        type: "quiz",
        format: "json",
        body: JSON.stringify({ title: "x", questions: [{ id: "q1" }] }),
      }),
    ).rejects.toThrow();
    await expect(
      alice.call("artifacts_save", {
        title: "Not json",
        type: "quiz",
        format: "json",
        body: "{nope",
      }),
    ).rejects.toThrow();
    await expect(
      alice.call("artifacts_update", { id: ok.id, body: '{"title":"x"}' }),
    ).rejects.toThrow();
    // the tool schema rejects unknown types before the backend
    await expect(
      alice.call("artifacts_save", { ...html("x", "y"), type: "poster" }),
    ).rejects.toThrow();
    expect(await listIds(alice)).toEqual([ok.id]);
  });

  it("round-trips state and keeps the write limit", async () => {
    const t = createConvexBackend();
    // the harness fakes setTimeout only; state writes also need a clock
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    const start = Date.parse("2026-10-22T09:00:00Z");
    vi.setSystemTime(start);
    await signUp(t, ALICE, "alice@example.com");
    const alice = mcpCaller(t, ALICE);
    const { id } = savedSchema.parse(
      await alice.call("artifacts_save", html("Doc", "<p>hi</p>")),
    );

    expect(await alice.call("artifacts_state_get", { id })).toBeNull();
    expect(
      stateSchema.parse(
        await alice.call("artifacts_state_set", {
          id,
          sets: { score: "3", seen: "1" },
        }),
      ).data,
    ).toEqual({ score: "3", seen: "1" });
    expect(
      stateSchema.parse(await alice.call("artifacts_state_get", { id })).data,
    ).toEqual({ score: "3", seen: "1" });
    await expect(
      alice.call("artifacts_state_set", { id, sets: { score: "4" } }),
    ).rejects.toThrow(/one per second/);

    vi.setSystemTime(start + 2000);
    expect(
      stateSchema.parse(
        await alice.call("artifacts_state_set", { id, removes: ["seen"] }),
      ).data,
    ).toEqual({ score: "3" });
    vi.setSystemTime(start + 4000);
    expect(
      stateSchema.parse(await alice.call("artifacts_state_reset", { id })).data,
    ).toEqual({});
  });

  it("deletes to the trash and restores", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    const alice = mcpCaller(t, ALICE);
    const { id } = savedSchema.parse(
      await alice.call("artifacts_save", html("Gone soon", "<p>trash me</p>")),
    );

    expect(await alice.call("artifacts_delete", { id })).toEqual({
      id,
      deleted: true,
    });
    expect(await listIds(alice)).toEqual([]);
    expect(await alice.call("artifacts_search", { query: "trash" })).toEqual(
      [],
    );
    expect(
      detailSchema.parse(await alice.call("artifacts_get", { id })).deletedAt,
    ).toEqual(expect.any(Number));
    await expect(
      alice.call("artifacts_update", { id, title: "New" }),
    ).rejects.toThrow(/in the trash/);

    expect(await alice.call("artifacts_restore", { id })).toEqual({
      id,
      restored: true,
    });
    expect(await listIds(alice)).toEqual([id]);
    expect(
      detailSchema.parse(await alice.call("artifacts_get", { id })),
    ).not.toHaveProperty("deletedAt");
  });

  it("keeps personal and team artifacts apart", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const alicePersonal = mcpCaller(t, ALICE);
    const aliceTeam = mcpCaller(t, ALICE, "team");
    const bobPersonal = mcpCaller(t, BOB);
    const bobTeam = mcpCaller(t, BOB, "team");

    await expect(aliceTeam.call("artifacts_list")).rejects.toThrow(
      /No team profiles available/,
    );
    const { teamId } = teamCreatedSchema.parse(
      await alicePersonal.call("teams_create", { name: "Crew" }),
    );

    const mine = savedSchema.parse(
      await alicePersonal.call("artifacts_save", {
        ...html("Mine", "<p>private notes</p>"),
        origin: { client: "vibot", externalId: "p1" },
      }),
    );
    const ours = savedSchema.parse(
      await aliceTeam.call(
        "artifacts_save",
        html("Ours", "<p>shared notes</p>"),
      ),
    );
    expect(await listIds(alicePersonal)).toEqual([mine.id]);
    expect(await listIds(aliceTeam)).toEqual([ours.id]);
    expect(
      rowsSchema
        .parse(await aliceTeam.call("artifacts_search", { query: "notes" }))
        .map((row) => row.id),
    ).toEqual([ours.id]);

    // the other scope's rows read as not found
    await expect(
      aliceTeam.call("artifacts_get", { id: mine.id }),
    ).rejects.toThrow(/Artifact not found/);
    expect(
      await aliceTeam.call("artifacts_get", {
        client: "vibot",
        externalId: "p1",
      }),
    ).toBeNull();
    await expect(
      alicePersonal.call("artifacts_update", { id: ours.id, title: "Hijack" }),
    ).rejects.toThrow(/Artifact not found/);
    await expect(
      bobPersonal.call("artifacts_get", { id: mine.id }),
    ).rejects.toThrow(/Artifact not found/);
    expect(await listIds(bobPersonal)).toEqual([]);

    // a member reads and edits team artifacts, but cannot delete them
    await alicePersonal.call("teams_add_member", {
      teamId,
      email: "bob@example.com",
    });
    expect(await listIds(bobTeam)).toEqual([ours.id]);
    await bobTeam.call("artifacts_update", { id: ours.id, title: "Ours v2" });
    await expect(
      bobTeam.call("artifacts_delete", { id: ours.id }),
    ).rejects.toThrow(/creator or a team owner/);
    // state is per user
    await bobTeam.call("artifacts_state_set", {
      id: ours.id,
      sets: { score: "9" },
    });
    expect(
      await aliceTeam.call("artifacts_state_get", { id: ours.id }),
    ).toBeNull();
    expect(
      await aliceTeam.call("artifacts_delete", { id: ours.id }),
    ).toMatchObject({ deleted: true });
    expect(await listIds(bobTeam)).toEqual([]);
  });
});
