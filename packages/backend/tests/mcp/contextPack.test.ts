import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseToolJson } from "./client";
import {
  createInProcessSession,
  InProcessMcpClient,
  MOCK_MCP_TOKEN,
} from "./inProcess";
import { MOCK_TEAM_PROFILE_ID, seedMemory } from "./mockBackend";

const contextPackResultSchema = z.object({
  markdown: z.string(),
  memoryIds: z.array(z.string()),
  skillNames: z.array(z.string()),
  includesProfile: z.boolean(),
  truncated: z.boolean(),
  skillSource: z.enum(["jev", "lexical"]).nullable(),
});

describe("in-process MCP context_pack", () => {
  it("packs task memories, fitting skills, and the profile on personal", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    const pnpm = seedMemory(client.session.store, {
      title: "Prefers pnpm",
      content: "Use pnpm for vmem workspaces",
    });
    seedMemory(client.session.store, {
      title: "Coffee order",
      content: "Oat latte every morning",
    });
    await client.callTool("skills_create", {
      name: "pnpm-workspace",
      description: "Set up a pnpm workspace monorepo",
      instructions: "Run pnpm init",
    });

    const result = await client.callTool("context_pack", {
      task: "pnpm workspace",
    });
    expect(result.isError ?? false).toBe(false);
    const pack = contextPackResultSchema.parse(parseToolJson(result));
    expect(pack.memoryIds[0]).toBe(pnpm.id);
    expect(pack.skillNames).toEqual(["pnpm-workspace"]);
    expect(pack.skillSource).toBe("lexical");
    expect(pack.includesProfile).toBe(true);
    expect(pack.markdown).toContain("Prefers pnpm");
    expect(pack.markdown).toContain("Harness mock profile.");
  });

  it("omits the personal profile on the team connector and honours skillLimit 0", async () => {
    const client = new InProcessMcpClient({
      session: createInProcessSession("team"),
      token: MOCK_MCP_TOKEN,
    });
    const shared = seedMemory(client.session.store, {
      title: "Team deploy runbook",
      content: "Deploy from main after review",
      profileId: MOCK_TEAM_PROFILE_ID,
    });

    const pack = contextPackResultSchema.parse(
      parseToolJson(
        await client.callTool("context_pack", {
          task: "deploy",
          skillLimit: 0,
        }),
      ),
    );
    expect(pack.memoryIds).toEqual([shared.id]);
    expect(pack.includesProfile).toBe(false);
    expect(pack.skillSource).toBeNull();
    expect(pack.markdown).not.toContain("vmem User Profile");
  });

  it("rejects an empty task and an out-of-range budget", async () => {
    const client = new InProcessMcpClient({ token: MOCK_MCP_TOKEN });
    expect((await client.callTool("context_pack", { task: " " })).isError).toBe(
      true,
    );
    expect(
      (await client.callTool("context_pack", { task: "x", maxChars: 10 }))
        .isError,
    ).toBe(true);
  });
});
