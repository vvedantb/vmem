import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "convex/**/*.test.ts"],
    environmentMatchGlobs: [
      ["convex/**", "edge-runtime"],
      ["tests/**", "node"],
    ],
    disableConsoleIntercept: true,
    // @vvedantb/server 0.1.0 dist/mcp has extensionless imports Node ESM cannot load.
    server: { deps: { inline: ["@vvedantb/server"] } },
  },
});
