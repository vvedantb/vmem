import { describe, expect, it } from "vitest";
import {
  catalogNamesForScope,
  CORE_TOOL_NAMES,
  FILES_TOOL_NAMES,
  MEMORY_GRAPH_TOOL,
  MEMORY_TOOL_NAMES,
  SKILLS_TOOL_NAMES,
  WIKI_TOOL_NAMES,
} from "./catalog";
import { parseToolJson, toolText } from "./client";
import { InProcessMcpClient, MOCK_MCP_TOKEN } from "./inProcess";
import { seedMemory } from "./mockBackend";
import {
  deletedFlagSchema,
  memoryCandidateListSchema,
  memoryIdResultSchema,
  memoryListResultSchema,
} from "./schemas";

describe("in-process MCP extreme catalog", () => {
  it("personal catalog is every core/memory/skills/wiki/files tool plus graph, no neo4j", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const names = await client.listTools();
    expect(names.sort()).toEqual(catalogNamesForScope("personal").sort());
    expect(names).toEqual(
      expect.arrayContaining([
        ...CORE_TOOL_NAMES,
        ...MEMORY_TOOL_NAMES,
        ...SKILLS_TOOL_NAMES,
        ...WIKI_TOOL_NAMES,
        ...FILES_TOOL_NAMES,
        MEMORY_GRAPH_TOOL,
      ]),
    );
    expect(names.some((name) => /codebase|github|neo4j/i.test(name))).toBe(
      false,
    );
  });
});

describe("in-process MCP extreme memory", () => {
  it("empty corpus retrieve is empty; dense corpus ranks pnpm over coffee", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const empty = memoryCandidateListSchema.parse(
      parseToolJson(
        await client.callTool("memory_retrieve", {
          query: "package manager",
          tags: ["missing-tag"],
        }),
      ),
    );
    expect(empty).toEqual([]);

    const pnpm = seedMemory(client.session.store, {
      title: "Prefers pnpm",
      content: "Use pnpm as the package manager for the vmem monorepo.",
      tags: ["tooling", "dense"],
      type: "knowledge",
      source: "mcp",
    });
    seedMemory(client.session.store, {
      title: "Coffee order",
      content: "Oat latte every morning, unrelated to package managers.",
      tags: ["food", "dense"],
      type: "episodic",
      source: "web",
    });
    for (let i = 0; i < 12; i += 1) {
      seedMemory(client.session.store, {
        title: `Distractor ${String(i)}`,
        content: `Noise row ${String(i)} about weather and groceries.`,
        tags: ["dense"],
        type: "knowledge",
      });
    }

    const ranked = memoryCandidateListSchema.parse(
      parseToolJson(
        await client.callTool("memory_retrieve", {
          query: "what package manager does the user use for vmem",
          tags: ["dense"],
          limit: 5,
        }),
      ),
    );
    expect(ranked[0]?.id).toBe(pnpm.id);
  });

  it("near-duplicates and synonym paraphrase still retrieve the pnpm fact", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const original = seedMemory(client.session.store, {
      title: "Prefers pnpm",
      content: "The user uses pnpm for JavaScript packages.",
      tags: ["dup"],
    });
    seedMemory(client.session.store, {
      title: "Prefers pnpm workspaces",
      content: "pnpm workspaces in the vmem monorepo.",
      tags: ["dup"],
    });
    const retrieved = memoryCandidateListSchema.parse(
      parseToolJson(
        await client.callTool("memory_retrieve", {
          query: "which node package manager",
          tags: ["dup"],
          limit: 5,
        }),
      ),
    );
    expect(retrieved.map((memory) => memory.id)).toContain(original.id);
    expect(retrieved[0]?.title.toLowerCase()).toContain("pnpm");
  });

  it("unicode / RTL / emoji queries do not dump the whole corpus", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const tea = seedMemory(client.session.store, {
      title: "Prefers green tea",
      content: "المستخدم يحب الشاي الأخضر في الصباح",
      tags: ["i18n"],
    });
    seedMemory(client.session.store, {
      title: "Coffee order",
      content: "Oat latte 🔥",
      tags: ["i18n"],
    });

    const arabic = memoryCandidateListSchema.parse(
      parseToolJson(
        await client.callTool("memory_retrieve", {
          query: "أين الشاي",
          tags: ["i18n"],
          limit: 5,
        }),
      ),
    );
    expect(arabic.map((memory) => memory.id)).toEqual([tea.id]);

    const searchedEmoji = memoryListResultSchema.parse(
      parseToolJson(
        await client.callTool("memory_search", {
          query: "🔥",
          tags: ["i18n"],
        }),
      ),
    );
    expect(searchedEmoji.memories).toHaveLength(1);
    expect(searchedEmoji.memories[0]?.title).toBe("Coffee order");

    const stopwords = memoryListResultSchema.parse(
      parseToolJson(
        await client.callTool("memory_search", {
          query: "what is the",
          tags: ["i18n"],
        }),
      ),
    );
    expect(stopwords.memories).toEqual([]);
  });

  it("multi-filter AND plus contradictory filters", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const hit = seedMemory(client.session.store, {
      title: "Prefers pnpm",
      content: "Use pnpm",
      tags: ["tooling", "combo"],
      type: "knowledge",
      source: "mcp",
      status: "pinned",
    });
    seedMemory(client.session.store, {
      title: "Coffee order",
      content: "Oat latte",
      tags: ["combo"],
      type: "episodic",
      source: "web",
    });

    const combo = memoryCandidateListSchema.parse(
      parseToolJson(
        await client.callTool("memory_retrieve", {
          query: "pnpm",
          type: "knowledge",
          tags: ["tooling", "combo"],
          status: "pinned",
          source: "mcp",
          limit: 10,
        }),
      ),
    );
    expect(combo.map((memory) => memory.id)).toEqual([hit.id]);

    const contradiction = memoryCandidateListSchema.parse(
      parseToolJson(
        await client.callTool("memory_retrieve", {
          query: "pnpm",
          type: "episodic",
          tags: ["tooling"],
          source: "mcp",
          limit: 10,
        }),
      ),
    );
    expect(contradiction).toEqual([]);
  });

  it("search pagination edges: offset 0, 1, huge; limit 1; reject 0 and huge", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    seedMemory(client.session.store, {
      title: "Alpha pnpm",
      content: "pnpm alpha",
      tags: ["page"],
    });
    seedMemory(client.session.store, {
      title: "Beta pnpm",
      content: "pnpm beta",
      tags: ["page"],
    });

    const first = memoryListResultSchema.parse(
      parseToolJson(
        await client.callTool("memory_search", {
          query: "pnpm",
          tags: ["page"],
          limit: 1,
          offset: 0,
        }),
      ),
    );
    expect(first.memories).toHaveLength(1);

    const second = memoryListResultSchema.parse(
      parseToolJson(
        await client.callTool("memory_search", {
          query: "pnpm",
          tags: ["page"],
          limit: 1,
          offset: 1,
        }),
      ),
    );
    expect(second.memories).toHaveLength(1);
    expect(second.memories[0]?.id).not.toBe(first.memories[0]?.id);

    const huge = memoryListResultSchema.parse(
      parseToolJson(
        await client.callTool("memory_search", {
          query: "pnpm",
          tags: ["page"],
          limit: 1,
          offset: 10_000,
        }),
      ),
    );
    expect(huge.memories).toEqual([]);

    expect(
      (await client.callTool("memory_search", { query: "pnpm", limit: 0 }))
        .isError,
    ).toBe(true);
    expect(
      (await client.callTool("memory_retrieve", { query: "pnpm", limit: 99 }))
        .isError,
    ).toBe(true);
  });

  it("update missing id, delete missing id, second delete is 404-shaped error", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const created = memoryIdResultSchema.parse(
      parseToolJson(
        await client.callTool("memory_add", {
          title: "Throwaway",
          content: "delete me",
          type: "knowledge",
          source: "mcp",
        }),
      ),
    );
    const missingUpdate = await client.callTool("memory_update", {
      id: "mem_does_not_exist",
      title: "nope",
    });
    expect(missingUpdate.isError).toBe(true);

    const missingRelated = await client.callTool("memory_related", {
      memoryId: "mem_does_not_exist",
    });
    expect(missingRelated.isError).toBe(true);

    const deleted = deletedFlagSchema.parse(
      parseToolJson(await client.callTool("memory_delete", { id: created.id })),
    );
    expect(deleted.deleted).toBe(true);
    const second = await client.callTool("memory_delete", { id: created.id });
    expect(second.isError).toBe(true);
  });

  it("wrong profileId on add/search is an error, not a silent other-workspace write", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const add = await client.callTool("memory_add", {
      title: "Should not land",
      content: "wrong profile",
      type: "knowledge",
      source: "mcp",
      profileId: "profile_does_not_exist",
    });
    expect(add.isError).toBe(true);
  });

  it("long document retrieve still hits; tiny noisy query does not dump corpus", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const longBody = `${"pnpm ".repeat(8000)}end.`;
    const longDoc = seedMemory(client.session.store, {
      title: "Long pnpm notes",
      content: longBody,
      tags: ["long"],
    });
    seedMemory(client.session.store, {
      title: "Coffee order",
      content: "Oat latte",
      tags: ["long"],
    });
    const retrieved = memoryCandidateListSchema.parse(
      parseToolJson(
        await client.callTool("memory_retrieve", {
          query: "pnpm",
          tags: ["long"],
          limit: 5,
        }),
      ),
    );
    expect(retrieved[0]?.id).toBe(longDoc.id);

    const tiny = memoryCandidateListSchema.parse(
      parseToolJson(
        await client.callTool("memory_retrieve", {
          query: "zz",
          tags: ["long"],
          limit: 5,
        }),
      ),
    );
    expect(tiny).toEqual([]);
  });
});

describe("in-process MCP extreme non-memory tools", () => {
  it("skills/wiki/files missing ids and graph limit 0", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    expect(
      (await client.callTool("skills_get", { name: "no-such-skill" })).isError,
    ).toBe(true);
    expect(
      (await client.callTool("wiki_get", { id: "wiki_missing" })).isError,
    ).toBe(true);
    expect(
      (await client.callTool("files_get", { path: "no/such.txt" })).isError,
    ).toBe(true);
    expect(
      (await client.callTool(MEMORY_GRAPH_TOOL, { limit: 0 })).isError,
    ).toBe(true);
    const graph = await client.callTool(MEMORY_GRAPH_TOOL, { limit: 1 });
    expect(graph.isError ?? false).toBe(false);
    expect(toolText(graph).length).toBeGreaterThan(0);
  });
});
