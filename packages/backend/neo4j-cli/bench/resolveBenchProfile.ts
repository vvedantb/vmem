/**
 * Resolve the personal MCP active profile id for a Clerk user.
 * Used by bench ingest (--user) so memories land in the profile MCP reads.
 */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function resolveBenchProfileId(clerkId: string): string {
  const args = JSON.stringify({ clerkId });
  const out = execSync(
    `npx convex run internal.profiles.getActiveProfileForMcpInternal ${JSON.stringify(args)}`,
    { cwd: backendRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();

  if (!out || out === "null") {
    throw new Error(`no MCP profile for clerkId ${clerkId}`);
  }

  const profile = JSON.parse(out) as { _id: string };
  return profile._id;
}
