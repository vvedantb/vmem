import path from "node:path";
import { assertInvalid, assertValid, repoRoot } from "./harness.mjs";

assertInvalid(
  "no-double-cast",
  `const x = value as unknown as string;\n`,
);

assertValid(
  "no-double-cast",
  `const x = value as string;\n`,
);

assertInvalid(
  "no-inline-object-type-assertion",
  `const x = value as { foo: string };\n`,
);

assertValid(
  "no-inline-object-type-assertion",
  `type Foo = { foo: string };\nconst x = value as Foo;\n`,
);

assertInvalid(
  "no-deep-package-imports",
  `import { api } from "@vmem/backend/convex/foo";\n`,
);

assertValid(
  "no-deep-package-imports",
  `import { api } from "@vmem/backend";\n`,
);

assertValid(
  "no-deep-package-imports",
  `import { cn } from "@vmem/ui/cn";\n`,
);

assertInvalid(
  "no-ts-nocheck",
  `// @ts-nocheck\nexport const x = 1;\n`,
);

assertValid(
  "no-ts-nocheck",
  `export const x = 1;\n`,
);

assertInvalid(
  "prefer-schema-inferred-types",
  `
import { z } from "zod";
const userSchema = z.object({ id: z.string() });
type User = { id: string };
`,
);

assertValid(
  "prefer-schema-inferred-types",
  `
import { z } from "zod";
const userSchema = z.object({ id: z.string() });
type User = z.infer<typeof userSchema>;
`,
);

assertInvalid(
  "no-conditional-tests",
  `
import { expect, test } from "vitest";
test("x", () => {
  if (true) {
    expect(1).toBe(1);
  }
});
`,
  "example.test.ts",
);

assertValid(
  "no-conditional-tests",
  `
import { expect, test } from "vitest";
test("x", () => {
  expect(1).toBe(1);
});
`,
  "example.test.ts",
);

assertInvalid(
  "no-json-parse",
  `const data = JSON.parse(raw);\n`,
);

// Cast to anything other than `unknown` does not count as narrowing.
assertInvalid(
  "no-json-parse",
  `const data = JSON.parse(raw) as MyType;\n`,
);

assertValid(
  "no-json-parse",
  `const data = schema.safeParse(JSON.parse(raw));\n`,
);

assertValid(
  "no-json-parse",
  `const data = schema.parse(JSON.parse(raw));\n`,
);

assertValid(
  "no-json-parse",
  `const data: unknown = JSON.parse(raw);\n`,
);

assertValid(
  "no-json-parse",
  `const data = JSON.parse(raw) as unknown;\n`,
);

assertInvalid(
  "no-unknown-shape-probing",
  `const v = Reflect.get(obj, "key");\n`,
);

assertInvalid(
  "no-unknown-shape-probing",
  `const vals = list.map((item) => Reflect.get(item, "key"));\n`,
);

// The rule deliberately allows `in` — it stays the sanctioned way to narrow
// discriminated unions and typed SDK unions in this codebase.
assertValid(
  "no-unknown-shape-probing",
  `const has = "key" in obj;\n`,
);

assertValid(
  "no-unknown-shape-probing",
  `const has = Reflect.has(obj, "key");\n`,
);

assertInvalid(
  "no-engine-imports-convex",
  `import { db } from "../convex/client";\nexport const x = db;\n`,
  { filename: "packages/backend/engine/foo.ts" },
);

assertInvalid(
  "no-engine-imports-convex",
  `import { mutation } from "../../convex/_generated/server";\nexport const x = mutation;\n`,
  { filename: "packages/backend/engine/neo4j/memory.ts" },
);

assertValid(
  "no-engine-imports-convex",
  `import { helper } from "./helper";\nexport const x = helper;\n`,
  { filename: "packages/backend/engine/foo.ts" },
);

// The rule only enforces inside engine/ — a convex/ file importing engine/
// (the normal, allowed direction) is out of scope entirely.
assertValid(
  "no-engine-imports-convex",
  `import { thing } from "../engine/thing";\nexport const x = thing;\n`,
  { filename: "packages/backend/convex/foo.ts" },
);

// no-cross-package-relative-imports resolves its package roots once, at
// plugin load time, by scanning this repo's real packages/ and apps/ folders
// (via import.meta.url of the rule file) — not anything under the linted
// file's own temp dir. So fixtures must physically live under packages/ for
// the rule to recognize them as packages at all; baseDir puts the mkdtemp
// scratch dir there instead of the OS temp dir, and it is removed afterward
// same as any other case.
const packagesDir = path.join(repoRoot, "packages");

assertInvalid(
  "no-cross-package-relative-imports",
  `import { bar } from "../../b/src/bar";\nexport const x = bar;\n`,
  {
    filename: "a/src/foo.ts",
    baseDir: packagesDir,
    extraFiles: {
      "a/package.json": JSON.stringify({ name: "a" }),
      "b/package.json": JSON.stringify({ name: "b" }),
    },
  },
);

assertInvalid(
  "no-cross-package-relative-imports",
  `import { bar } from "../b/index";\nexport const x = bar;\n`,
  {
    filename: "a/index.ts",
    baseDir: packagesDir,
    extraFiles: {
      "a/package.json": JSON.stringify({ name: "a" }),
      "b/package.json": JSON.stringify({ name: "b" }),
    },
  },
);

assertValid(
  "no-cross-package-relative-imports",
  `import { bar } from "./bar";\nexport const x = bar;\n`,
  {
    filename: "a/src/foo.ts",
    baseDir: packagesDir,
    extraFiles: {
      "a/package.json": JSON.stringify({ name: "a" }),
    },
  },
);

// Non-relative specifiers are always out of scope, regardless of location —
// this is the fix the rule's own message recommends.
assertValid(
  "no-cross-package-relative-imports",
  `import { other } from "@acme/other-package";\n`,
);
