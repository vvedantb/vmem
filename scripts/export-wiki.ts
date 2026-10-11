// One-off operator script for the Verve import. REMOVE it (and
// packages/backend/convex/wikiExport.ts) in a follow-up PR after the owner
// confirms the import.
//
// Runs wikiExport:exportAll against a Convex deployment. JSON goes to stdout,
// or to the file given as the first argument. Needs Node 22.6+.
//
// Equivalent prod command:
//   cd packages/backend && CONVEX_DEPLOYMENT=prod:clear-bear-690 npx convex run wikiExport:exportAll --pretty
//
// Usage:
//   node --experimental-strip-types scripts/export-wiki.ts [out.json]
// Set CONVEX_DEPLOYMENT to pick another deployment. It defaults to prod.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DEPLOYMENT = "prod:clear-bear-690";
const backendDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "backend",
);

const json = execFileSync(
  "npx",
  ["convex", "run", "wikiExport:exportAll", "--pretty"],
  {
    cwd: backendDir,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env,
      CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT ?? DEFAULT_DEPLOYMENT,
    },
  },
);

const outFile = process.argv[2];
if (outFile === undefined) {
  process.stdout.write(json);
} else {
  writeFileSync(outFile, json);
  console.error(`Wrote ${outFile}`);
}
