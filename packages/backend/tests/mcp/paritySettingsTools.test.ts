import { describe, expect, it } from "vitest";
import { z } from "zod";
import { api, internal } from "../../convex/_generated/api";
import { settingsToolSpecs } from "../../convex/mcp/toolsSettings";
import {
  asUser,
  createConvexBackend,
  mcpCaller,
  signUp,
  type McpCaller,
} from "./convexHarness";

const ALICE = "clerk_settings_alice";
const BOB = "clerk_settings_bob";

const settingsSchema = z.object({
  aboutMe: z.string(),
  memoryConfidenceThreshold: z.number(),
  dreamModeAutomatic: z.boolean(),
  dreamModeDecay: z.boolean(),
  experimentalFlags: z.object({ disablePageMotion: z.boolean() }),
});
const connectorListSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    provider: z.string().nullable(),
    connectionStatus: z.string(),
  }),
);
const memorySearchSchema = z.object({ memories: z.array(z.unknown()) });
const aiLogsSchema = z.object({
  logs: z.array(z.object({ id: z.string(), model: z.string() })),
  isDone: z.boolean(),
  nextCursor: z.string().nullable(),
});

async function settingsOf(caller: McpCaller) {
  return settingsSchema.parse(await caller.call("settings_get"));
}

async function addMemory(caller: McpCaller, title: string) {
  await caller.call("memory_add", {
    title,
    content: `${title} body`,
    type: "knowledge",
    source: "manual",
  });
}

async function memoryCount(caller: McpCaller): Promise<number> {
  return memorySearchSchema.parse(await caller.call("memory_search")).memories
    .length;
}

describe("MCP settings parity tools (convex-test backend)", () => {
  it("settings tools change only the caller's settings, within the UI limits", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const alice = mcpCaller(t, ALICE);
    const bob = mcpCaller(t, BOB);

    expect(await settingsOf(alice)).toMatchObject({
      aboutMe: "",
      memoryConfidenceThreshold: 70,
      experimentalFlags: { disablePageMotion: false },
    });
    expect(
      await alice.call("settings_update", {
        aboutMe: "Builds vmem",
        memoryConfidenceThreshold: 85,
      }),
    ).toMatchObject({ aboutMe: "Builds vmem", memoryConfidenceThreshold: 85 });
    await expect(alice.call("settings_update", {})).rejects.toThrow(
      /at least one setting/,
    );
    for (const patch of [
      { aboutMe: "x".repeat(501) },
      { memoryConfidenceThreshold: 101 },
      { extensionAutoSyncIntervalMinutes: 5 },
      { theme: "neon" },
    ]) {
      expect(
        settingsToolSpecs.settings_update.schema.safeParse(patch).success,
      ).toBe(false);
    }
    // the same limits hold on the web mutation
    await expect(
      asUser(t, ALICE, "alice@example.com").mutation(api.userSettings.update, {
        preferences: "y".repeat(501),
      }),
    ).rejects.toThrow(/at most 500/);

    await alice.call("settings_update", { dreamModeDecay: false });
    await alice.call("settings_set_experimental_flag", {
      key: "disablePageMotion",
      enabled: true,
    });
    expect(await settingsOf(alice)).toMatchObject({
      dreamModeAutomatic: true,
      dreamModeDecay: false,
      experimentalFlags: { disablePageMotion: true },
    });

    expect(await settingsOf(bob)).toMatchObject({
      aboutMe: "",
      memoryConfidenceThreshold: 70,
      dreamModeDecay: true,
      experimentalFlags: { disablePageMotion: false },
    });
    await expect(
      mcpCaller(t, ALICE, "team").call("settings_get"),
    ).rejects.toThrow(/not available on team/);
  });

  it("memory_delete_all is web UI only: MCP refuses it, the web action still wipes", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const alice = mcpCaller(t, ALICE);
    const bob = mcpCaller(t, BOB);
    await addMemory(alice, "Alice one");
    await addMemory(alice, "Alice two");
    await addMemory(bob, "Bob one");

    await expect(
      alice.call("memory_delete_all", { confirm: "delete all memories" }),
    ).rejects.toThrow(/Unknown tool: memory_delete_all/);
    expect(await memoryCount(alice)).toBe(2);

    expect(
      await asUser(t, ALICE, "alice@example.com").action(
        api.memoryApi.deleteAllMemories,
        {},
      ),
    ).toBe(2);
    expect(await memoryCount(alice)).toBe(0);
    expect(await memoryCount(bob)).toBe(1);
  });
});

describe("MCP connectors parity tools (convex-test backend)", () => {
  it("connector tools act on the caller's connectors only", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const alice = mcpCaller(t, ALICE);
    const bob = mcpCaller(t, BOB);

    const connectors = connectorListSchema.parse(
      await alice.call("connectors_list"),
    );
    expect(
      connectors
        .flatMap((row) => row.provider ?? [])
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["figma", "github", "gmail", "google_drive", "notion"]);
    const notion = connectors.find((row) => row.provider === "notion");
    if (notion === undefined) throw new Error("expected notion");

    for (const [name, args] of [
      ["connectors_sync", { connectorId: notion.id }],
      ["connectors_disconnect", { connectorId: notion.id }],
      ["connectors_delete_data", { connectorId: notion.id, confirm: true }],
      ["connectors_sync", { connectorId: "not-an-id" }],
    ] as const) {
      await expect(bob.call(name, args)).rejects.toThrow(/Connector not found/);
    }
    await expect(
      alice.call("connectors_delete_data", { connectorId: notion.id }),
    ).rejects.toThrow();
    await expect(
      alice.call("connectors_sync", { connectorId: notion.id }),
    ).rejects.toThrow(/not connected/);

    expect(
      await alice.call("connectors_disconnect", { connectorId: notion.id }),
    ).toEqual({ disconnected: true });
    expect(
      await alice.call("connectors_delete_data", {
        connectorId: notion.id,
        confirm: true,
      }),
    ).toEqual({ deleted: 0 });
    expect(
      connectorListSchema
        .parse(await alice.call("connectors_list"))
        .find((row) => row.id === notion.id)?.connectionStatus,
    ).toBe("disconnected");
  });
});

describe("MCP usage parity tools (convex-test backend)", () => {
  it("usage tools read the caller's AI and API usage only", async () => {
    const t = createConvexBackend();
    const aliceUser = await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const alice = mcpCaller(t, ALICE);
    const bob = mcpCaller(t, BOB);

    for (const model of ["model-a", "model-b", "model-a"]) {
      await t.mutation(internal.openRouterLogs.recordInternal, {
        userId: aliceUser.userId,
        profileId: aliceUser.profileId,
        feature: "chat",
        endpoint: "chat",
        model,
        totalTokens: 10,
        costUsd: 0.01,
      });
    }
    await t.mutation(internal.openRouterLogs.drainAggregatesInternal, {});

    const firstPage = aiLogsSchema.parse(
      await alice.call("usage_ai_logs", { limit: 2 }),
    );
    expect(firstPage.logs).toHaveLength(2);
    expect(firstPage.isDone).toBe(false);
    const secondPage = aiLogsSchema.parse(
      await alice.call("usage_ai_logs", {
        limit: 2,
        cursor: firstPage.nextCursor ?? undefined,
      }),
    );
    expect(secondPage.logs).toHaveLength(1);
    expect(
      aiLogsSchema.parse(
        await alice.call("usage_ai_logs", { models: ["model-b"] }),
      ).logs,
    ).toHaveLength(1);
    expect(await alice.call("usage_ai_models")).toEqual(["model-a", "model-b"]);
    // totalCostUsd is not asserted: convex-test shares state between the two
    // DirectAggregate components registered from one module
    expect(
      await alice.call("usage_ai_summary", { range: "all" }),
    ).toMatchObject({ totalCalls: 3, totalTokens: 30 });

    expect(aiLogsSchema.parse(await bob.call("usage_ai_logs")).logs).toEqual(
      [],
    );
    expect(await bob.call("usage_ai_models")).toEqual([]);
    await expect(
      bob.call("usage_ai_logs", { profileId: aliceUser.profileId }),
    ).rejects.toThrow(/Profile not found/);
    await expect(
      mcpCaller(t, BOB, "team").call("usage_ai_summary"),
    ).rejects.toThrow(/No team profiles available/);
    expect(await bob.call("usage_api_requests", { limit: 10 })).toEqual([]);
  });
});
