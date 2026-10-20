/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { z } from "zod";
import { register as registerAuditLog } from "convex-audit-log/test";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { toolSpecs } from "../../convex/mcp/toolCatalog";
import {
  bindToolSpec,
  type ToolHandlerContext,
} from "../../convex/mcp/toolTypes";
import type { McpScope } from "../../convex/profiles/mcpAccess";
import { getMemoryGraphForMcp } from "../../convex/mcp/graph";
import { memoryGraphInputSchema } from "../../convex/mcp/memoryGraphApp";
import { MEMORY_GRAPH_TOOL } from "./catalog";
import { requireActionCtx } from "./mockBackend";

const memoryGraphParamsSchema = z.object(memoryGraphInputSchema);

// Real backend (convex-test) behind the real MCP tool specs. Tool calls run
// as the given clerk user, exactly as nodeActions passes the verified token's
// subject. Scheduled work (embeddings, entity extraction) is dropped.
const modules = import.meta.glob("../../convex/**/*.ts");

export type ConvexTestBackend = ReturnType<typeof convexTest>;

export function createConvexBackend(): ConvexTestBackend {
  const t = convexTest(schema, modules);
  registerAuditLog(t);
  return t;
}

function convexActionCtx(t: ConvexTestBackend) {
  return requireActionCtx({
    runQuery: <Query extends FunctionReference<"query", "public" | "internal">>(
      query: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => t.query(query, ...args),
    runMutation: <
      Mutation extends FunctionReference<"mutation", "public" | "internal">,
    >(
      mutation: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => t.mutation(mutation, ...args),
    runAction: <
      Action extends FunctionReference<"action", "public" | "internal">,
    >(
      action: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => t.action(action, ...args),
    scheduler: {
      runAfter: async () => null,
      runAt: async () => null,
      cancel: async () => undefined,
    },
    storage: {
      store: (blob: Blob) => t.run((ctx) => ctx.storage.store(blob)),
      // t.run results must be Convex values, so bytes cross as ArrayBuffer
      get: async (id: Id<"_storage">) => {
        const stored = await t.run(async (ctx) => {
          const blob = await ctx.storage.get(id);
          return blob === null
            ? null
            : { bytes: await blob.arrayBuffer(), type: blob.type };
        });
        return stored === null
          ? null
          : new Blob([stored.bytes], { type: stored.type });
      },
      getUrl: (id: Id<"_storage">) => t.run((ctx) => ctx.storage.getUrl(id)),
      delete: (id: Id<"_storage">) => t.run((ctx) => ctx.storage.delete(id)),
    },
    vectorSearch: async () => [],
    auth: { getUserIdentity: async () => null },
  });
}

export type McpCaller = {
  clerkId: string;
  call: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
};

export function mcpCaller(
  t: ConvexTestBackend,
  clerkId: string,
  scope: McpScope = "personal",
): McpCaller {
  const h: ToolHandlerContext = {
    ctx: convexActionCtx(t),
    clerkUserId: clerkId,
    scope,
  };
  return {
    clerkId,
    call: async (name, args = {}) => {
      if (name === MEMORY_GRAPH_TOOL) {
        const params = memoryGraphParamsSchema.parse(args);
        return getMemoryGraphForMcp(h.ctx, {
          ...params,
          clerkId,
          mcpScope: scope,
        });
      }
      const spec = Object.values(toolSpecs).find(
        (entry) => entry.name === name,
      );
      if (!spec) throw new Error(`Unknown tool: ${name}`);
      if (spec.scopes !== undefined && !spec.scopes.includes(scope)) {
        throw new Error(`Tool ${name} is not available on ${scope} MCP`);
      }
      return bindToolSpec(spec).run(h, args);
    },
  };
}

// signs the user up the way the web app does (users row + default profile)
export async function signUp(
  t: ConvexTestBackend,
  clerkId: string,
  email: string,
): Promise<{ userId: Id<"users">; profileId: Id<"profiles"> }> {
  const user = t.withIdentity({ subject: clerkId, email, name: email });
  await user.mutation(api.auth.ensureUserExists, {});
  const profile = await t.mutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  return { userId: profile.userId, profileId: profile._id };
}

export function asUser(t: ConvexTestBackend, clerkId: string, email: string) {
  return t.withIdentity({ subject: clerkId, email, name: email });
}
