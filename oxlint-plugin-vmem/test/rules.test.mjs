import { assertInvalid, assertValid } from "./harness.mjs";

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
