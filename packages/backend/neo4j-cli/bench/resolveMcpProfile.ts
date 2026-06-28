/**
 * Resolve the personal MCP active profile id for a Clerk user (stdout only).
 * Used by internal/bench/claude-locomo-bench.ps1 for --user ingest alignment.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const clerkId = process.argv[2];
if (!clerkId) {
  console.error("usage: resolveMcpProfile.ts <clerkId>");
  process.exit(1);
}

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const args = JSON.stringify({ clerkId });
const out = execSync(
  `npx convex run internal.profiles.getActiveProfileForMcpInternal ${JSON.stringify(args)}`,
  { cwd: backendRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
).trim();

if (!out || out === "null") {
  console.error(`no MCP profile for clerkId ${clerkId}`);
  process.exit(1);
}

const profile = JSON.parse(out) as { _id: string };
process.stdout.write(profile._id);
