/**
 * CLI wrapper — resolve MCP profile id for a Clerk user (stdout only).
 */
import { resolveBenchProfileId } from "./resolveBenchProfile";

const clerkId = process.argv[2];
if (!clerkId) {
  console.error("usage: resolveMcpProfile.ts <clerkId>");
  process.exit(1);
}

try {
  process.stdout.write(resolveBenchProfileId(clerkId));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}
