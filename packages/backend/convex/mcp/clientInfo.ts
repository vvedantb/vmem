import { v } from "convex/values";
import { z } from "zod";
import { internalMutation, internalQuery } from "../_generated/server";
import { getUserByClerkId } from "../auth";

// Which app wrote an MCP memory. MCP here is stateless: each HTTP request
// builds a new server, so clientInfo from `initialize` is only known on that
// request. handleMcpRequest stores the name on the user row; later tool
// calls read it back. One name per user: the newest client to initialize.

const CLIENT_NAME_MAX = 64;
const DEFAULT_MCP_SOURCE = "mcp";

const initializeMessageSchema = z.object({
  method: z.literal("initialize"),
  params: z.object({ clientInfo: z.object({ name: z.string() }) }),
});

/** "Claude Code" -> "claude-code"; null when nothing usable is left. */
export function normalizeClientName(name: string): string | null {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, CLIENT_NAME_MAX);
  return slug.length === 0 ? null : slug;
}

// one message or a JSON-RPC batch; batch items are checked one by one
const rpcBodySchema = z.union([
  initializeMessageSchema,
  z.array(z.object({}).passthrough()),
]);

function parseRpcBody(body: string) {
  try {
    return rpcBodySchema.safeParse(JSON.parse(body));
  } catch {
    return null;
  }
}

/** clientInfo.name of an `initialize` message (or batch) in a JSON-RPC body. */
export function initializeClientName(body: string): string | null {
  const parsed = parseRpcBody(body);
  if (parsed === null || !parsed.success) return null;
  const messages = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  for (const message of messages) {
    const init = initializeMessageSchema.safeParse(message);
    if (init.success) {
      return normalizeClientName(init.data.params.clientInfo.name);
    }
  }
  return null;
}

/**
 * Source for an MCP write: the connected app's clientInfo.name, else the
 * source the agent passed, else "mcp". (The OAuth client is not on the MCP
 * principal, so it is not a step here.)
 */
export function resolveMcpSource(args: {
  clientName: string | null | undefined;
  agentSource: string | undefined;
}): string {
  if (args.clientName) return args.clientName;
  const agent = args.agentSource?.trim();
  return agent ? agent : DEFAULT_MCP_SOURCE;
}

export const getClientNameInternal = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    return user?.mcpClientName ?? null;
  },
});

// writes only on a change, so a client that initializes often costs a read
export const recordClientNameInternal = internalMutation({
  args: { clerkId: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const name = normalizeClientName(args.name);
    if (name === null) return null;
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user || user.mcpClientName === name) return null;
    await ctx.db.patch(user._id, { mcpClientName: name });
    return null;
  },
});
