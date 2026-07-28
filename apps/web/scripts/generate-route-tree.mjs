// Regenerates src/routeTree.gen.ts without starting the Vite dev server.
// The TanStack Router Vite plugin normally regenerates this file during dev/build.
// This script invokes the same Generator the plugin uses, so CI/typecheck runs
// can refresh the route tree after adding/removing routes.
//
// Usage: `node scripts/generate-route-tree.mjs` from apps/web.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Generator, getConfig } from "@tanstack/router-generator";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");

const config = getConfig(
  {
    routesDirectory: "./src/routes",
    routeFileIgnorePattern:
      "(-searchParams\\.ts|_components|_utils\\.ts|Client\\.tsx|Panel\\.tsx)",
    autoCodeSplitting: true,
  },
  projectRoot,
);

const generator = new Generator({ config, root: projectRoot });
await generator.run();
console.info("Regenerated", path.join(projectRoot, "src/routeTree.gen.ts"));
