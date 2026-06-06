import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts",
      "convex/**/*.test.ts",
      "neo4j-cli/**/*.test.ts",
    ],
    environmentMatchGlobs: [
      ["convex/**", "edge-runtime"],
      ["tests/**", "node"],
      ["neo4j-cli/**", "node"],
    ],
  },
});
