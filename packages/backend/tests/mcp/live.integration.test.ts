import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  catalogNamesForScope,
  MEMORY_GRAPH_TOOL,
  MEMORY_TOOL_NAMES,
} from "./catalog";
import {
  DEFAULT_MCP_SITE,
  McpClient,
  mcpPost,
  parseMcpHttpError,
  parseToolJson,
  toolText,
} from "./client";
import {
  deletedFlagSchema,
  healthBodySchema,
  memoryCandidateListSchema,
  memoryIdResultSchema,
  memoryListResultSchema,
  oauthAuthorizationServerSchema,
  oauthProtectedResourceSchema,
  pingResultSchema,
  relatedMemoriesResultSchema,
  whoamiResultSchema,
} from "./schemas";

const runLive = process.env.RUN_MCP_LIVE === "1";
const liveToken = process.env.MCP_BEARER_TOKEN ?? "";
const site = process.env.VMEM_HTTP_API_BASE_URL ?? DEFAULT_MCP_SITE;
const hasToken = liveToken.length > 0;

describe.skipIf(!runLive)("live MCP catalog / auth (no token)", () => {
  it("GET /health returns ok", async () => {
    const response = await fetch(`${site}/health`);
    const json: unknown = await response.json().catch(() => null);
    const parsed = healthBodySchema.safeParse(json);
    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.status).toBe("ok");
  });

  it("serves OAuth protected-resource metadata for personal and team", async () => {
    const personalResponse = await fetch(
      `${site}/.well-known/oauth-protected-resource`,
    );
    const personalJson: unknown = await personalResponse.json();
    const personal = oauthProtectedResourceSchema.parse(personalJson);
    expect(personal.resource).toBe(`${site}/mcp`);
    expect(personal.authorization_servers.length).toBeGreaterThan(0);
    expect(personal.bearer_methods_supported).toContain("header");

    const teamResponse = await fetch(
      `${site}/.well-known/oauth-protected-resource/mcp/team`,
    );
    const teamJson: unknown = await teamResponse.json();
    const team = oauthProtectedResourceSchema.parse(teamJson);
    expect(team.resource).toBe(`${site}/mcp/team`);

    const asResponse = await fetch(
      `${site}/.well-known/oauth-authorization-server`,
    );
    const asJson: unknown = await asResponse.json();
    const asMeta = oauthAuthorizationServerSchema.parse(asJson);
    expect(asMeta.token_endpoint).toContain("oauth/token");
  }, 15_000);

  it("rejects missing and invalid bearer tokens on personal and team MCP", async () => {
    const missing = await mcpPost({
      site,
      scope: "personal",
      token: null,
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "vmem-mcp-harness", version: "0.1.0" },
        },
      },
    });
    expect(missing.status).toBe(401);
    expect(parseMcpHttpError(missing.json)).toBe(
      "Missing Authorization header",
    );
    expect(missing.wwwAuthenticate).toContain("oauth-protected-resource");

    const invalid = await mcpPost({
      site,
      scope: "personal",
      token: "not-a-real-token",
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      },
    });
    expect(invalid.status).toBe(401);
    expect(parseMcpHttpError(invalid.json)).toBe("Invalid or expired token");

    const teamMissing = await mcpPost({
      site,
      scope: "team",
      token: null,
      body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect(teamMissing.status).toBe(401);
    expect(parseMcpHttpError(teamMissing.json)).toBe(
      "Missing Authorization header",
    );
    expect(teamMissing.wwwAuthenticate).toContain("mcp/team");
  }, 20_000);

  it("malformed JSON and oversized bodies are rejected before tool dispatch", async () => {
    const missingAuth = await fetch(`${site}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: "{not-json",
    });
    expect(missingAuth.status).toBe(401);

    const invalidAuth = await fetch(`${site}/mcp`, {
      method: "POST",
      headers: {
        Authorization: "Bearer not-a-real-token",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: "{not-json",
    });
    expect(invalidAuth.status).toBe(401);

    const oversized = await fetch(`${site}/mcp`, {
      method: "POST",
      headers: {
        Authorization: "Bearer not-a-real-token",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"pad":"${"x".repeat(200_000)}"}}`,
    });
    expect([401, 413, 400]).toContain(oversized.status);

    const getPersonal = await fetch(`${site}/mcp`, { method: "GET" });
    expect([401, 405]).toContain(getPersonal.status);
  }, 20_000);
});

describe.skipIf(!runLive)("live MCP rejects non-OAuth bearers", () => {
  it.each([
    { label: "vmem API key", token: process.env.VMEM_API_KEY },
    { label: "Convex session JWT", token: process.env.CONVEX_JWT },
  ])("rejects $label", async ({ token }) => {
    if (token === undefined || token.length === 0) return;
    const response = await mcpPost({
      site,
      scope: "personal",
      token,
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "vmem-mcp-harness", version: "0.1.0" },
        },
      },
    });
    expect(response.status).toBe(401);
    expect(parseMcpHttpError(response.json)).toBe("Invalid or expired token");
  });
});

describe.skipIf(!runLive || !hasToken)("live MCP authenticated tools", () => {
  it("initializes and lists personal tools without codebase/neo4j/github", async () => {
    const client = new McpClient({ site, token: liveToken });
    const init = await client.initialize();
    expect(init.serverInfo.name).toBe("vmem-mcp");
    const names = await client.listTools();
    const expected = catalogNamesForScope("personal");
    for (const name of expected) {
      expect(names, name).toContain(name);
    }
    for (const name of MEMORY_TOOL_NAMES) {
      expect(names).toContain(name);
    }
    expect(names).toContain(MEMORY_GRAPH_TOOL);
    expect(names.some((name) => name.includes("codebase"))).toBe(false);
    expect(names.some((name) => name.includes("github"))).toBe(false);
    expect(names.some((name) => name.toLowerCase().includes("neo4j"))).toBe(
      false,
    );
  }, 20_000);

  it("lists team tools with memory tools and without personal-only surfaces", async () => {
    const client = new McpClient({ site, token: liveToken, scope: "team" });
    const init = await client.initialize();
    expect(init.serverInfo.name).toBe("vmem-mcp-team");
    const names = await client.listTools();
    for (const name of MEMORY_TOOL_NAMES) {
      expect(names).toContain(name);
    }
    expect(names).toContain(MEMORY_GRAPH_TOOL);
    expect(names).not.toContain("context_prompt_get");
    expect(names.some((name) => name.startsWith("skills_"))).toBe(true);
    expect(names).toContain("skills_recommend");
    expect(names.some((name) => name.startsWith("wiki_"))).toBe(false);
    expect(names.some((name) => name.startsWith("files_"))).toBe(false);
    expect(names.some((name) => name.toLowerCase().includes("neo4j"))).toBe(
      false,
    );
  }, 20_000);

  it("pings and whoami", async () => {
    const client = new McpClient({ site, token: liveToken });
    const ping = pingResultSchema.parse(
      parseToolJson(await client.callTool("ping")),
    );
    expect(ping.ok).toBe(true);
    expect(ping.scope).toBe("personal");
    const whoami = whoamiResultSchema.parse(
      parseToolJson(await client.callTool("whoami")),
    );
    expect(whoami.authenticated).toBe(true);
    expect(whoami.clerkUserId.length).toBeGreaterThan(0);
  }, 20_000);

  it("memory add/search/retrieve/related/update/delete plus filters and errors", async () => {
    const client = new McpClient({ site, token: liveToken });
    const marker = `e2e-mcp-${randomUUID()}`;
    const ids: string[] = [];

    try {
      const addPnpm = await client.callTool("memory_add", {
        title: `${marker} prefers pnpm`,
        content:
          "The user uses pnpm as the package manager for the vmem monorepo.",
        type: "knowledge",
        source: "mcp",
        tags: [marker, "tooling"],
      });
      expect(addPnpm.isError ?? false).toBe(false);
      const pnpm = memoryIdResultSchema.parse(parseToolJson(addPnpm));
      ids.push(pnpm.id);

      const addCoffee = await client.callTool("memory_add", {
        title: `${marker} coffee order`,
        content: "Oat latte every morning, unrelated to package managers.",
        type: "episodic",
        source: "mcp",
        tags: [marker, "food"],
      });
      expect(addCoffee.isError ?? false).toBe(false);
      const coffee = memoryIdResultSchema.parse(parseToolJson(addCoffee));
      ids.push(coffee.id);

      const searched = memoryListResultSchema.parse(
        parseToolJson(
          await client.callTool("memory_search", {
            query: "pnpm",
            tags: [marker],
          }),
        ),
      );
      expect(searched.memories.map((memory) => memory.id)).toContain(pnpm.id);

      const retrieved = memoryCandidateListSchema.parse(
        parseToolJson(
          await client.callTool("memory_retrieve", {
            query: "what package manager does the user use for vmem",
            tags: [marker],
            limit: 5,
          }),
        ),
      );
      expect(retrieved[0]?.id).toBe(pnpm.id);

      const filtered = memoryCandidateListSchema.parse(
        parseToolJson(
          await client.callTool("memory_retrieve", {
            query: marker,
            type: "episodic",
            tags: [marker],
            limit: 10,
          }),
        ),
      );
      expect(filtered.map((memory) => memory.id)).toContain(coffee.id);
      expect(filtered.map((memory) => memory.id)).not.toContain(pnpm.id);

      const empty = memoryCandidateListSchema.parse(
        parseToolJson(
          await client.callTool("memory_retrieve", {
            query: marker,
            tags: [`${marker}-missing`],
            limit: 10,
          }),
        ),
      );
      expect(empty).toEqual([]);

      const related = relatedMemoriesResultSchema.parse(
        parseToolJson(
          await client.callTool("memory_related", { memoryId: pnpm.id }),
        ),
      );
      expect(Array.isArray(related)).toBe(true);

      const updated = memoryIdResultSchema.parse(
        parseToolJson(
          await client.callTool("memory_update", {
            id: pnpm.id,
            title: `${marker} prefers pnpm workspaces`,
            status: "pinned",
          }),
        ),
      );
      expect(updated.title).toContain("workspaces");

      const instruction = await client.callTool("memory_add_instruction", {
        instruction: `${marker} remember a throwaway live-e2e fact`,
      });
      expect(instruction.isError).toBe(true);
      expect(toolText(instruction)).toContain("openrouter_required");

      const graph = await client.callTool(MEMORY_GRAPH_TOOL, { limit: 10 });
      expect(graph.isError ?? false).toBe(false);

      const badRetrieve = await client.callTool("memory_retrieve", {});
      expect(badRetrieve.isError).toBe(true);
      const badDelete = await client.callTool("memory_delete", {});
      expect(badDelete.isError).toBe(true);

      const deleted = deletedFlagSchema.parse(
        parseToolJson(
          await client.callTool("memory_delete", { id: coffee.id }),
        ),
      );
      expect(deleted.deleted).toBe(true);
      ids.splice(ids.indexOf(coffee.id), 1);
    } finally {
      for (const id of ids) {
        await client.callTool("memory_delete", { id }).catch(() => undefined);
      }
    }
  }, 90_000);
});
