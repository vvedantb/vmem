import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toolSpecs } from "../../convex/mcp/toolCatalog";
import {
  RETIRED_SYSTEM_SKILL_NAMES,
  SYSTEM_SKILL_SEEDS,
} from "../../convex/prompts/systemSkillSeeds";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_generated" || entry.name === "node_modules") {
        continue;
      }
      out.push(...listTsFiles(full));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("codebase graph feature is gone", () => {
  it("MCP catalog has no codebase or github tools", () => {
    const names = Object.keys(toolSpecs);
    expect(names.some((name) => name.includes("codebase"))).toBe(false);
    expect(names.some((name) => name.includes("github"))).toBe(false);
  });

  it("system skill seeds no longer ship codebase wiki playbooks", () => {
    expect(SYSTEM_SKILL_SEEDS.map((seed) => seed.name)).toEqual([
      "wiki-writeup",
      "teach-me",
      "search-skills-first",
    ]);
    expect(
      SYSTEM_SKILL_SEEDS.some((seed) => seed.category === "Codebases"),
    ).toBe(false);
    expect([...RETIRED_SYSTEM_SKILL_NAMES]).toEqual([
      "setup-wiki",
      "update-wiki",
      "Codebase Knowledge Base",
    ]);
  });

  it("schema, wiki validators, and shared package have no codebase tables or files", () => {
    const schema = readFileSync(join(backendRoot, "convex/schema.ts"), "utf8");
    const validators = readFileSync(
      join(backendRoot, "convex/validators.ts"),
      "utf8",
    );
    expect(schema).not.toMatch(/\bcodebases\b/);
    expect(schema).not.toMatch(/\bgithubConnections\b/);
    expect(validators).not.toMatch(/sourceCodebaseId/);
    expect(existsSync(join(backendRoot, "../shared/src/codebase.ts"))).toBe(
      false,
    );
  });

  it("convex modules do not include codebase sync or github-connection files", () => {
    const leftover = listTsFiles(join(backendRoot, "convex")).filter((file) => {
      const rel = file.slice(backendRoot.length).toLowerCase();
      return rel.includes("codebase") || rel.includes("githubconnection");
    });
    expect(leftover).toEqual([]);
  });

  it("http, crons, and workpools do not mention codebase sync", () => {
    const http = readFileSync(join(backendRoot, "convex/http.ts"), "utf8");
    const crons = readFileSync(join(backendRoot, "convex/crons.ts"), "utf8");
    const workpools = readFileSync(
      join(backendRoot, "convex/workpools.ts"),
      "utf8",
    );
    expect(http.toLowerCase()).not.toContain("codebase");
    expect(http.toLowerCase()).not.toContain("github");
    expect(crons.toLowerCase()).not.toContain("codebase");
    expect(workpools.toLowerCase()).not.toContain("codebase");
  });

  it("chrome extension prompt no longer advertises codebase knowledge", () => {
    const constants = readFileSync(
      join(backendRoot, "../../apps/chrome-extension/src/lib/constants.ts"),
      "utf8",
    );
    expect(constants.toLowerCase()).not.toContain("codebase knowledge");
  });
});
