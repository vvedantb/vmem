import { describe, expect, it } from "vitest";
import { catalogNamesForScope } from "./catalog";
import {
  DEFAULT_MCP_SITE,
  McpClient,
  mcpPost,
  parseMcpHttpError,
  parseToolJson,
} from "./client";
import {
  deletedFlagSchema,
  healthBodySchema,
  memoryIdResultSchema,
  oauthAuthorizationServerSchema,
  oauthProtectedResourceSchema,
  pingResultSchema,
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
});

describe.skipIf(!runLive || !hasToken)("live MCP authenticated tools", () => {
  it("initializes and lists tools without codebase tools", async () => {
    const client = new McpClient({ site, token: liveToken });
    const init = await client.initialize();
    expect(init.serverInfo.name).toBe("vmem-mcp");
    const names = await client.listTools();
    const expected = catalogNamesForScope("personal");
    for (const name of expected) {
      expect(names, name).toContain(name);
    }
    expect(names.some((name) => name.includes("codebase"))).toBe(false);
  }, 20_000);

  it("pings, then creates and deletes a harness memory", async () => {
    const client = new McpClient({ site, token: liveToken });
    const pingResult = await client.callTool("ping");
    expect(pingResult.isError ?? false).toBe(false);
    const ping = pingResultSchema.parse(parseToolJson(pingResult));
    expect(ping.ok).toBe(true);

    const addResult = await client.callTool("memory_add", {
      title: "mcp-harness ping",
      content: "Temporary memory from the MCP live harness",
      type: "knowledge",
      source: "mcp",
      tags: ["mcp-harness"],
    });
    expect(addResult.isError ?? false).toBe(false);
    const added = memoryIdResultSchema.parse(parseToolJson(addResult));
    expect(added.title).toContain("mcp-harness");

    const deletedResult = await client.callTool("memory_delete", {
      id: added.id,
    });
    expect(deletedResult.isError ?? false).toBe(false);
    const deleted = deletedFlagSchema.parse(parseToolJson(deletedResult));
    expect(deleted.deleted).toBe(true);
  }, 30_000);
});
