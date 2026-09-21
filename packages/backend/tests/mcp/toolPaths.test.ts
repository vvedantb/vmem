import { describe, expect, it } from "vitest";
import { z } from "zod";
import { memoryToolSpecs } from "../../convex/mcp/toolsMemory";
import { catalogNamesForScope, MEMORY_GRAPH_TOOL } from "./catalog";
import { parseMcpHttpError, parseToolJson, toolText } from "./client";
import {
  createInProcessSession,
  InProcessMcpClient,
  MOCK_MCP_TOKEN,
} from "./inProcess";
import { seedMemory } from "./mockBackend";
import type { McpToolContent } from "./schemas";
import {
  contextPromptResultSchema,
  deletedFlagSchema,
  fileDeleteResultSchema,
  fileGetResultSchema,
  fileListSchema,
  fileUploadResultSchema,
  memoryCandidateListSchema,
  memoryIdResultSchema,
  memoryListResultSchema,
  pingResultSchema,
  profileListSchema,
  profileResultSchema,
  relatedMemoriesResultSchema,
  skillCreatedSchema,
  skillFetchedSchema,
  skillsIndexEntrySchema,
  skillUpdatedSchema,
  whoamiResultSchema,
  wikiDeletedSchema,
  wikiNodeResultSchema,
  wikiSearchResultSchema,
} from "./schemas";

const unknownJsonSchema = z.unknown();
const skillsListSchema = z.array(skillsIndexEntrySchema);
const skillsRecommendSchema = z.object({
  query: z.string(),
  source: z.enum(["jev", "lexical"]),
  skills: z.array(skillsIndexEntrySchema.extend({ score: z.number() })),
});
const wikiListSchema = z.array(wikiNodeResultSchema);

function parseToolPayload(result: McpToolContent): unknown {
  expect(result.isError ?? false).toBe(false);
  return unknownJsonSchema.parse(parseToolJson(result));
}

describe("in-process MCP auth gate", () => {
  it("rejects missing and invalid bearer tokens", async () => {
    const missing = new InProcessMcpClient({ token: null });
    const missingResponse = await missing.request("initialize");
    expect(missingResponse.status).toBe(401);
    expect(parseMcpHttpError(missingResponse.json)).toBe(
      "Missing Authorization header",
    );
    expect(missingResponse.wwwAuthenticate).toContain(
      "oauth-protected-resource",
    );

    const invalid = new InProcessMcpClient({ token: "not-valid" });
    const invalidResponse = await invalid.request("initialize");
    expect(invalidResponse.status).toBe(401);
    expect(parseMcpHttpError(invalidResponse.json)).toBe(
      "Invalid or expired token",
    );
  });

  it("accepts the mock bearer and initializes personal and team servers", async () => {
    const personal = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const personalInit = await personal.initialize();
    expect(personalInit.serverInfo.name).toBe("vmem-mcp");

    const team = new InProcessMcpClient({
      session: createInProcessSession("team"),
      token: MOCK_MCP_TOKEN,
    });
    const teamInit = await team.initialize();
    expect(teamInit.serverInfo.name).toBe("vmem-mcp-team");
  });
});

describe("in-process MCP catalog", () => {
  it("lists every personal tool including memory_graph and no codebase tools", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const names = await client.listTools();
    expect(names.sort()).toEqual(catalogNamesForScope("personal").sort());
    expect(names).toContain(MEMORY_GRAPH_TOOL);
    expect(names.some((name) => name.includes("codebase"))).toBe(false);
  });

  it("omits wiki, files, and context_prompt on the team connector", async () => {
    const client = new InProcessMcpClient({
      session: createInProcessSession("team"),
      token: MOCK_MCP_TOKEN,
    });
    const names = await client.listTools();
    expect(names.sort()).toEqual(catalogNamesForScope("team").sort());
    expect(names).not.toContain("context_prompt_get");
    expect(names.some((name) => name.startsWith("skills_"))).toBe(true);
    expect(names).toContain("skills_recommend");
    expect(names.some((name) => name.startsWith("wiki_"))).toBe(false);
    expect(names.some((name) => name.startsWith("files_"))).toBe(false);
  });
});

describe("in-process MCP memory tools", () => {
  it("parses personal and team-shaped arguments for every memory tool", () => {
    expect(
      memoryToolSpecs.memory_search.schema.safeParse({
        query: "package manager",
        type: "knowledge",
        tags: ["tooling"],
        source: "mcp",
        profileId: "profile_team",
        limit: 20,
        offset: 0,
      }).success,
    ).toBe(true);
    expect(
      memoryToolSpecs.memory_retrieve.schema.safeParse({
        query: "what editor does the user like",
        limit: 5,
      }).success,
    ).toBe(true);
    expect(
      memoryToolSpecs.memory_add.schema.safeParse({
        title: "Prefers pnpm",
        content: "Use pnpm",
        type: "knowledge",
        source: "mcp",
      }).success,
    ).toBe(true);
    expect(
      memoryToolSpecs.memory_add_instruction.schema.safeParse({
        instruction: "Remember the user prefers dark mode",
      }).success,
    ).toBe(true);
    expect(
      memoryToolSpecs.memory_update.schema.safeParse({
        id: "mem_1",
        title: "Prefers pnpm workspaces",
        status: "pinned",
      }).success,
    ).toBe(true);
    expect(
      memoryToolSpecs.memory_delete.schema.safeParse({ id: "mem_1" }).success,
    ).toBe(true);
    expect(
      memoryToolSpecs.memory_related.schema.safeParse({
        memoryId: "mem_1",
      }).success,
    ).toBe(true);
  });

  it("add, search, retrieve, related, update, and delete on the happy path", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    seedMemory(client.session.store, {
      title: "Coffee order",
      content: "Oat latte every morning",
      tags: ["food"],
    });

    const added = memoryIdResultSchema.parse(
      parseToolPayload(
        await client.callTool("memory_add", {
          title: "Prefers pnpm",
          content: "Use pnpm for vmem workspaces",
          type: "knowledge",
          source: "mcp",
          tags: ["tooling"],
        }),
      ),
    );
    expect(added.title).toBe("Prefers pnpm");

    const searched = memoryListResultSchema.parse(
      parseToolPayload(
        await client.callTool("memory_search", { query: "pnpm" }),
      ),
    );
    expect(searched.memories.map((memory) => memory.title)).toContain(
      "Prefers pnpm",
    );

    const retrieved = memoryCandidateListSchema.parse(
      parseToolPayload(
        await client.callTool("memory_retrieve", { query: "pnpm", limit: 5 }),
      ),
    );
    expect(retrieved[0]?.title).toBe("Prefers pnpm");

    const related = relatedMemoriesResultSchema.parse(
      parseToolPayload(
        await client.callTool("memory_related", { memoryId: added.id }),
      ),
    );
    expect(Array.isArray(related)).toBe(true);

    const updated = memoryIdResultSchema.parse(
      parseToolPayload(
        await client.callTool("memory_update", {
          id: added.id,
          title: "Prefers pnpm workspaces",
          status: "pinned",
        }),
      ),
    );
    expect(updated.title).toBe("Prefers pnpm workspaces");

    const deleted = deletedFlagSchema.parse(
      parseToolPayload(
        await client.callTool("memory_delete", { id: added.id }),
      ),
    );
    expect(deleted.deleted).toBe(true);
  });

  it("add_instruction fails with openrouter_required without OPENROUTER_API_KEY", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const result = await client.callTool("memory_add_instruction", {
      instruction: "Remember the user prefers dark mode",
    });
    expect(result.isError).toBe(true);
    expect(toolText(result)).toContain("openrouter_required");
  });

  it("rejects bad arguments on every memory tool", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: "memory_retrieve", args: {} },
      { name: "memory_add", args: { title: "x" } },
      { name: "memory_add_instruction", args: {} },
      { name: "memory_update", args: {} },
      { name: "memory_delete", args: {} },
      { name: "memory_related", args: {} },
      { name: "memory_search", args: { limit: 0 } },
      { name: "memory_retrieve", args: { query: "x", limit: 99 } },
    ];
    for (const entry of cases) {
      const result = await client.callTool(entry.name, entry.args);
      expect(result.isError, entry.name).toBe(true);
    }
  });

  it("memory_graph returns structured graph stats", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    seedMemory(client.session.store, {
      title: "Prefers pnpm",
      content: "Use pnpm",
      tags: ["tooling"],
    });
    const result = await client.callTool(MEMORY_GRAPH_TOOL, { limit: 10 });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toBeDefined();
  });
});

describe("in-process MCP core, skills, wiki, and files tools", () => {
  it("smokes ping, whoami, profiles, and context_prompt_get", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const ping = pingResultSchema.parse(
      parseToolPayload(await client.callTool("ping")),
    );
    expect(ping.ok).toBe(true);
    expect(ping.scope).toBe("personal");

    const whoami = whoamiResultSchema.parse(
      parseToolPayload(await client.callTool("whoami")),
    );
    expect(whoami.authenticated).toBe(true);
    expect(whoami.activeProfile?.name).toBe("Personal");

    const profiles = profileListSchema.parse(
      parseToolPayload(await client.callTool("list_profiles")),
    );
    expect(profiles.length).toBeGreaterThan(0);

    const active = profileResultSchema.parse(
      parseToolPayload(
        await client.callTool("set_active_profile", {
          profileId: profiles[0]?.id,
        }),
      ),
    );
    expect(active.id).toBe(profiles[0]?.id);

    const prompt = contextPromptResultSchema.parse(
      parseToolPayload(await client.callTool("context_prompt_get")),
    );
    expect(prompt.content).toContain("vmem User Profile");
  });

  it("creates, reads, updates, and deletes a skill", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const created = skillCreatedSchema.parse(
      parseToolPayload(
        await client.callTool("skills_create", {
          name: "harness-skill",
          description: "When testing MCP",
          instructions: "Call ping first",
        }),
      ),
    );
    expect(created.name).toBe("harness-skill");

    const listed = skillsListSchema.parse(
      parseToolPayload(await client.callTool("skills_list")),
    );
    expect(listed.map((skill) => skill.name)).toContain("harness-skill");

    const fetched = skillFetchedSchema.parse(
      parseToolPayload(
        await client.callTool("skills_get", { name: "harness-skill" }),
      ),
    );
    expect(fetched.instructions).toContain("ping");

    const updated = skillUpdatedSchema.parse(
      parseToolPayload(
        await client.callTool("skills_update", {
          name: "harness-skill",
          enabled: false,
        }),
      ),
    );
    expect(updated.enabled).toBe(false);

    const deleted = await client.callTool("skills_delete", {
      name: "harness-skill",
    });
    expect(deleted.isError ?? false).toBe(false);
  });

  it("recommends skills with lexical fail-open and isolates personal vs team grants", async () => {
    const personalSession = createInProcessSession("personal");
    const personal = new InProcessMcpClient({
      session: personalSession,
      token: MOCK_MCP_TOKEN,
    });
    const team = new InProcessMcpClient({
      session: { store: personalSession.store, scope: "team" },
      token: MOCK_MCP_TOKEN,
    });

    await personal.callTool("skills_create", {
      name: "wiki-writeup",
      description: "Chapter-style wiki explainer to read later",
      instructions: "Write the wiki",
    });
    await personal.callTool("skills_create", {
      name: "deploy-vercel",
      description: "Ship a web app to Vercel production",
      instructions: "Deploy",
    });
    await team.callTool("skills_create", {
      name: "team-runbook",
      description: "Shared team incident response",
      instructions: "Page the on-call",
    });

    const recommended = skillsRecommendSchema.parse(
      parseToolPayload(
        await personal.callTool("skills_recommend", {
          query: "write a wiki explainer to read later",
        }),
      ),
    );
    expect(recommended.source).toBe("lexical");
    expect(recommended.skills[0]?.name).toBe("wiki-writeup");
    expect(recommended.skills.map((skill) => skill.name)).not.toContain(
      "team-runbook",
    );

    const personalListed = skillsListSchema.parse(
      parseToolPayload(await personal.callTool("skills_list")),
    );
    const teamListed = skillsListSchema.parse(
      parseToolPayload(await team.callTool("skills_list")),
    );
    expect(personalListed.map((skill) => skill.name)).toContain("wiki-writeup");
    expect(personalListed.map((skill) => skill.name)).not.toContain(
      "team-runbook",
    );
    expect(teamListed.map((skill) => skill.name)).toContain("team-runbook");
    expect(teamListed.map((skill) => skill.name)).not.toContain("wiki-writeup");

    const teamGetPersonal = await team.callTool("skills_get", {
      name: "wiki-writeup",
    });
    expect(teamGetPersonal.isError).toBe(true);
    const personalGetTeam = await personal.callTool("skills_get", {
      name: "team-runbook",
    });
    expect(personalGetTeam.isError).toBe(true);

    const deletedCross = await personal.callTool("skills_delete", {
      name: "team-runbook",
    });
    expect(deletedCross.isError).toBe(true);
    expect(
      skillsListSchema
        .parse(parseToolPayload(await team.callTool("skills_list")))
        .map((skill) => skill.name),
    ).toContain("team-runbook");
  });

  it("creates, reads, searches, updates, and deletes a wiki document", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const created = wikiNodeResultSchema.parse(
      parseToolPayload(
        await client.callTool("wiki_create", {
          kind: "document",
          title: "Harness notes",
          contentMarkdown: "MCP harness coverage",
        }),
      ),
    );
    expect(created.kind).toBe("document");

    const listed = wikiListSchema.parse(
      parseToolPayload(await client.callTool("wiki_list")),
    );
    expect(listed.map((node) => node.title)).toContain("Harness notes");

    const fetched = wikiNodeResultSchema.parse(
      parseToolPayload(await client.callTool("wiki_get", { id: created.id })),
    );
    expect(fetched.id).toBe(created.id);

    const searched = wikiSearchResultSchema.parse(
      parseToolPayload(
        await client.callTool("wiki_search", { query: "harness" }),
      ),
    );
    expect(searched.map((node) => node.id)).toContain(created.id);

    const updated = wikiNodeResultSchema.parse(
      parseToolPayload(
        await client.callTool("wiki_update", {
          id: created.id,
          title: "Harness notes v2",
        }),
      ),
    );
    expect(updated.title).toBe("Harness notes v2");

    const deleted = wikiDeletedSchema.parse(
      parseToolPayload(
        await client.callTool("wiki_delete", { id: created.id }),
      ),
    );
    expect(deleted.deletedCount).toBeGreaterThan(0);
  });

  it("uploads, lists, reads, and deletes a text file", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const uploaded = fileUploadResultSchema.parse(
      parseToolPayload(
        await client.callTool("files_upload", {
          path: "harness/note.txt",
          contentBase64: Buffer.from("hello mcp").toString("base64"),
          mimeType: "text/plain",
        }),
      ),
    );
    expect(uploaded.path).toBe("harness/note.txt");

    const listed = fileListSchema.parse(
      parseToolPayload(await client.callTool("files_list")),
    );
    expect(listed.some((entry) => entry.path === "harness/note.txt")).toBe(
      true,
    );

    const fetched = fileGetResultSchema.parse(
      parseToolPayload(
        await client.callTool("files_get", { path: "harness/note.txt" }),
      ),
    );
    expect(fetched.path).toBe("harness/note.txt");
    expect(fetched.text).toBe("hello mcp");

    const deleted = fileDeleteResultSchema.parse(
      parseToolPayload(
        await client.callTool("files_delete", { path: "harness/note.txt" }),
      ),
    );
    expect(deleted.deletedCount).toBeGreaterThan(0);
  });

  it("rejects bad arguments on core, skills, wiki, and files tools", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: "set_active_profile", args: {} },
      { name: "skills_get", args: {} },
      { name: "skills_recommend", args: {} },
      { name: "skills_create", args: { name: "x" } },
      { name: "skills_update", args: {} },
      { name: "skills_delete", args: {} },
      { name: "wiki_get", args: {} },
      { name: "wiki_search", args: {} },
      { name: "wiki_create", args: { kind: "document" } },
      { name: "wiki_update", args: {} },
      { name: "wiki_delete", args: {} },
      { name: "files_get", args: {} },
      { name: "files_upload", args: { path: "a.txt" } },
      { name: "files_delete", args: {} },
    ];
    for (const entry of cases) {
      const result = await client.callTool(entry.name, entry.args);
      expect(result.isError, entry.name).toBe(true);
    }
  });

  it("team ping and whoami work; context_prompt_get is not listed", async () => {
    const client = new InProcessMcpClient({
      session: createInProcessSession("team"),
      token: MOCK_MCP_TOKEN,
    });
    const ping = pingResultSchema.parse(
      parseToolPayload(await client.callTool("ping")),
    );
    expect(ping.scope).toBe("team");
    const whoami = whoamiResultSchema.parse(
      parseToolPayload(await client.callTool("whoami")),
    );
    expect(whoami.scope).toBe("team");
    const listed = await client.listTools();
    expect(listed).not.toContain("context_prompt_get");
  });
});
