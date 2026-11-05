import { v } from "convex/values";
import { z } from "zod";
import { internalMutation } from "../_generated/server";

// Which app wrote an MCP memory. MCP here is stateless: each HTTP request
// builds a new server, so clientInfo from `initialize` is only known on that
// request. handleMcpRequest stores the name in mcpSessions, keyed per user by
// connection (Mcp-Session-Id, else User-Agent), so Claude, Cursor and others
// connected at once each keep their own name. Later tool calls read it back.

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

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// lastSeen is touched at most this often, so tool calls rarely write
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const PURGE_BATCH = 500;
const KEY_PART_MAX = 256;

/**
 * Lookup keys for this MCP connection, best first: the Mcp-Session-Id
 * header, then the User-Agent. Rows are also scoped by clerkId, so two
 * users with the same User-Agent never share a row.
 */
export function mcpConnectionKeys(headers: {
  sessionId?: string;
  userAgent?: string;
}): string[] {
  const keys: string[] = [];
  const sessionId = headers.sessionId?.trim();
  if (sessionId) keys.push(`sid:${sessionId.slice(0, KEY_PART_MAX)}`);
  const userAgent = headers.userAgent?.trim().toLowerCase();
  if (userAgent) keys.push(`ua:${userAgent.slice(0, KEY_PART_MAX)}`);
  return keys;
}

// on initialize: store the name under every key of this connection
export const recordClientNameInternal = internalMutation({
  args: {
    clerkId: v.string(),
    connectionKeys: v.array(v.string()),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clientName = normalizeClientName(args.name);
    if (clientName === null) return null;
    const lastSeen = Date.now();
    for (const connectionKey of args.connectionKeys) {
      const row = await ctx.db
        .query("mcpSessions")
        .withIndex("by_clerkId_and_connectionKey", (q) =>
          q.eq("clerkId", args.clerkId).eq("connectionKey", connectionKey),
        )
        .unique();
      if (row === null) {
        await ctx.db.insert("mcpSessions", {
          clerkId: args.clerkId,
          connectionKey,
          clientName,
          lastSeen,
        });
      } else {
        await ctx.db.patch(row._id, { clientName, lastSeen });
      }
    }
    return null;
  },
});

// on a tool write: the first key with a stored name wins; touches lastSeen
export const resolveClientNameInternal = internalMutation({
  args: { clerkId: v.string(), connectionKeys: v.array(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const connectionKey of args.connectionKeys) {
      const row = await ctx.db
        .query("mcpSessions")
        .withIndex("by_clerkId_and_connectionKey", (q) =>
          q.eq("clerkId", args.clerkId).eq("connectionKey", connectionKey),
        )
        .unique();
      if (row === null) continue;
      if (now - row.lastSeen > TOUCH_INTERVAL_MS) {
        await ctx.db.patch(row._id, { lastSeen: now });
      }
      return row.clientName;
    }
    return null;
  },
});

// drops connections not seen for 30 days, a bounded batch each run
export const purgeExpiredInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    const rows = await ctx.db
      .query("mcpSessions")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", cutoff))
      .take(PURGE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});
