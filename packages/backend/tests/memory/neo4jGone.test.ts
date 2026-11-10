import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const packageJsonSchema = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
});

describe("Neo4j runtime is gone", () => {
  it("backend package.json has no neo4j dependency", () => {
    const raw = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../package.json"),
      "utf8",
    );
    const pkg = packageJsonSchema.parse(JSON.parse(raw));
    const names = [
      ...Object.keys(pkg.dependencies),
      ...Object.keys(pkg.devDependencies),
    ];
    expect(
      names.filter((name) => name.toLowerCase().includes("neo4j")),
    ).toEqual([]);
  });
});
