import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseYaml } from "./yaml.ts";

export const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

const seedMemorySchema = z
  .object({
    title: z.string().min(1),
    content: z.string().min(1),
    type: z.enum(["profile", "episodic", "knowledge"]),
    source: z.string().min(1).default("e2e-ab"),
    tags: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).default(1),
    // Orders seeding only. The store API has no createdAt field, so recency
    // comes from POST order (oldest first).
    createdAt: z.string().datetime().optional(),
  })
  .strict();

const fixtureSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1),
    kind: z.enum([
      "preference",
      "multi-hop",
      "update",
      "abstention",
      "exact-match",
      "project",
    ]),
    task: z.string().min(1),
    acceptanceCriteria: z.string().min(1),
    expectedFacts: z.array(z.string().min(1)).default([]),
    forbiddenFacts: z.array(z.string().min(1)).default([]),
    seedMemories: z.array(seedMemorySchema).min(1),
    expectedAbstention: z.boolean().default(false),
  })
  .strict()
  .superRefine((fixture, ctx) => {
    const abstains = fixture.kind === "abstention";
    if (abstains !== fixture.expectedAbstention) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "kind: abstention requires expectedAbstention: true (and only then)",
      });
    }
    if (!abstains && fixture.expectedFacts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expectedFacts must not be empty unless kind is abstention",
      });
    }
  });

export type Fixture = z.infer<typeof fixtureSchema>;
export type SeedMemory = Fixture["seedMemories"][number];

export function loadFixture(file: string): Fixture {
  const text = readFileSync(file, "utf8");
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") return fixtureSchema.parse(JSON.parse(text));
  if (ext === ".yaml" || ext === ".yml")
    return fixtureSchema.parse(parseYaml(text));
  throw new Error(`Unsupported fixture extension: ${file}`);
}

// selectors are fixture ids or file paths; empty means every fixture in dir
export function loadFixtures(
  dir: string = FIXTURES_DIR,
  selectors: readonly string[] = [],
): Fixture[] {
  const files = readdirSync(dir)
    .filter((name) => /\.(ya?ml|json)$/i.test(name))
    .sort()
    .map((name) => path.join(dir, name));
  const loaded: Fixture[] = [];
  for (const file of files) loaded.push(loadFixture(file));
  const ids = new Set<string>();
  for (const fixture of loaded) {
    if (ids.has(fixture.id))
      throw new Error(`Duplicate fixture id: ${fixture.id}`);
    ids.add(fixture.id);
  }
  if (selectors.length === 0) return loaded;
  return selectors.map((selector) => {
    const byId = loaded.find((fixture) => fixture.id === selector);
    return byId ?? loadFixture(path.resolve(selector));
  });
}
