// regenerates routeTree.gen.ts without starting the vite dev server
// invokes the same tanstack router generator the vite plugin uses
// run from apps/web via the generate route tree script

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
